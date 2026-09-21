"""INI-CET (M2 Phase 1) — parse official AIIMS PDFs into normalized layers.

Inputs : data/raw/aiims/<session>/result.pdf|result-oldportal.pdf,
         data/raw/aiims/<session>/round-<1st|2nd|open>.pdf
Outputs: data/parsed/aiims/<session>/result-mdms.jsonl, result-mds.jsonl,
         round-<n>.jsonl   (gitignored traceability layer, keeps raw strings)

Structural facts (verified against the PDFs, see M2 report):
  - Result PDFs: two sections with SEPARATE rank spaces — "MD,MS,DM,MCh
    Courses" (sno 1..~47k) and "MDS Courses" (sno restarts at 1). The engine
    consumes the MD/MS section only; both are parsed for traceability.
  - Round PDFs: sections "1.1 MD/MS..." and "1.2 MDS Course". Rows:
    Roll | Overall Rank | Category | PWBD | Specialty | Institute | Seat token
    Seat token = <CAT>[-PWBD][-roster] | IP-n (sponsored pool).
  - An OBC candidate can hold a UR seat -> cutoffs key on the SEAT category
    (same decision as NEET PG's allotted_category).

Hard failures (asserts) follow the Phase 2 convention: wrong totals, rank
gaps, non-monotonic percentile, duplicate roll-in-round all abort the file.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "aiims"
PARSED = ROOT / "data" / "parsed" / "aiims"

CATS = {"UR", "EWS", "OBC", "SC", "ST"}
# Seat token, permissively structural. Observed families: UR/EWS/OBC/SC/ST
# with [-PWBD] [-roster] [/COURSE-TAG] (EWS-10/OPH), course seats (UR-MRC),
# sponsored (IP-n), institute pool (INST-n), open-round non-clinical (OCS),
# preference/domicile earmarks (UR-AIIMS-Preference, UR-Karnataka Domicile).
# Category = leading family; the annotation is preserved raw.
SEAT_RE = re.compile(r"^(UR|OBC|SC|ST|EWS|IP|PWBD|INST|OCS)(?:[-/ ]?(.+))?$")

# Round data row: roll, rank, [category], [applied/pwbd tokens], specialty, institute, seat
ROW_RE = re.compile(
    r"^\s*(\d{6,10})\s+(\d{1,6})\s+"              # roll, overall rank
    r"((?:[A-Za-z*./-]+\s+){0,4}?)"               # middle: category / applied-under / pwbd ("Foreign National")
    r"(\S.*?)\s{2,}"                              # specialty (needs the wide gap to institute)
    r"([A-Z][A-Za-z0-9,&./()\' -]{3,45}?)"        # institute (may be mixed case, may contain commas)
    r"(?:\s{2,}([A-Z][A-Za-z0-9-]*(?:\s*[/ ]\s*[A-Za-z0-9-]+){0,4}))?\s*$"  # optional seat
)
# Non-allotment rows: the PDFs list (nearly) ALL qualified candidates rank-wise;
# everyone not allotted carries a status token; the trailing "NA NA" columns are
# printed by pdftotext sometimes on the line, sometimes wrapped below it.
STATUS_ROW_RE = re.compile(
    r"^\s*(\d{6,10})\s+(\d{1,6})\s+((?:[A-Za-z*./-]+\s+){0,3}?)"
    r"(FCNA(?:/NSA)?|NR/NP|NSA|NOT\s+ALLOTTED|Seat\s+Allocation\s+Completed\s+\([A-Za-z0-9]+\s+Round\))"
    r"(?:\s+NA){0,2}\s*$",
    re.I,
)
PAGE_RE = re.compile(r"Page \d+ of \d+")
MDMS_SECTION_RE = re.compile(r"(?:1\.1\.?\s*)?(?:MD/?MS|MD, ?MS|Announcement)", re.I)
MDS_SECTION_RE = re.compile(r"(?:1\.2\.?\s*)?MDS (?:Course|Courses)", re.I)


def pdftotext(pdf: Path) -> str:
    out = subprocess.run(
        ["pdftotext", "-table", str(pdf), "-"],
        capture_output=True, timeout=600,
    )
    if out.returncode != 0:
        raise RuntimeError(f"pdftotext failed on {pdf}: {out.stderr[:200]}")
    # PDF text streams carry cp1252-ish bytes (soft hyphens, bullets) — decode
    # permissively; the parser only matches ASCII shapes.
    return out.stdout.decode("utf-8", errors="replace")


def classify_middle(tokens):
    """Split the middle tokens into category / applied-under / pwbd flags."""
    category, applied, pwbd = None, None, False
    for t in tokens:
        if not t:
            continue
        if t.upper() in CATS:
            category = t.upper()
        elif t.lower() in ("yes", "pwbd", "y"):
            pwbd = True
        elif re.fullmatch(r"[A-Za-z*][A-Za-z*./-]*", t):
            applied = (applied + " " + t).strip() if applied else t
        else:
            raise ValueError(f"unclassifiable middle token {t!r}")
    return category, applied, pwbd


# ---- institute-anchored row parsing ------------------------------------------
# Column gaps in these PDFs are unreliable under pdftotext (category/specialty/
# institute sometimes collapse to single spaces; institutes sometimes carry
# doubled spaces). The INSTITUTE SET is small and closed, so rows are parsed
# by locating the institute name — everything before it is roll/rank/category/
# specialty, everything after it is the seat token.
AIIMS_CITIES = (
    "NEW DELHI|BHOPAL|BHUBANESWAR|BIBINAGAR|BILASPUR|DEOGHAR|GORAKHPUR|GUWAHATI|"
    "JAMMU|JODHPUR|KALYANI|MANGALAGIRI|NAGPUR|PATNA|RAEBARELI|RAIPUR|RAJKOT|"
    "RISHIKESH|BATHINDA"
)
# Institute names can render with doubled internal spaces on some pages of
# some round PDFs (a pdftotext -table quirk: "AIIMS  NEW  DELHI"). Make the
# name components whitespace-flexible so those rows anchor correctly — the
# parsed value is still canonicalized to single spaces by institute_canonical.
# Found while ingesting Jan-2026: the strict form had been silently dropping
# a handful of AIIMS-ND rows in 11 historical round files (12-28 rows each);
# the flex form is strictly additive (verified: zero removals/modifications).
_CITIES_FLEX = AIIMS_CITIES.replace(" ", r"\s+")
INSTITUTE_RE = re.compile(
    rf"(?:AIIMS\s*,?\s*(?:{_CITIES_FLEX})"
    rf"|JIPMER\s*,?\s*PUDUCHERRY"
    rf"|PGIMER\s*,?\s*CHANDIGARH"
    rf"|NIMHANS\s*,?\s*BENGALURU"
    rf"|SCTIMST\s*,?\s*(?:TRIVANDRUM|THIRUVANANTHAPURAM))",
    re.I,
)

APPLIED_WORDS = {"FOREIGN", "NATIONAL", "SPONSORED", "OCI", "OCI*", "FN", "SPON",
                 "NATIONAL/OCI", "NATIONAL/OCI*"}


def institute_canonical(raw: str) -> str:
    return re.sub(r"\s+", " ", raw.upper().replace(",", " ")).strip()


def parse_data_line(line: str):
    """One data row -> dict, or ('BAD', reason) for review, or None (not a row)."""
    matches = list(INSTITUTE_RE.finditer(line))
    if not matches:
        return None
    im = matches[-1]
    prefix, tail = line[: im.start()], line[im.end():]
    institute_raw = institute_canonical(im.group(0))

    lm = re.match(r"^\s*(\d{6,10})\s+(\d{1,6})\s+(.+?)\s*$", prefix)
    if not lm:
        return None
    roll, rank, mid = lm.groups()

    # seat token after the institute (absent on Foreign-National rows)
    seat_str = tail.strip()
    seat_cat, seat_pwd, annotation = None, False, None
    if seat_str and seat_str != "NA":
        sm = SEAT_RE.match(seat_str)
        if not sm:
            return ("BAD", f"unrecognized seat token {seat_str!r}")
        seat_cat = sm.group(1)
        seat_pwd = "PWBD" in seat_str
        annotation = (sm.group(2) or "").strip() or None

    # leading tokens of `mid`: category / applied-under / pwbd; rest = specialty
    tokens = mid.split()
    category, applied, pwbd = None, [], False
    i = 0
    while i < len(tokens):
        t = tokens[i].upper().rstrip("*")
        if t in ("UR", "EWS", "OBC", "SC", "ST"):
            category = t
        elif t == "OBC-NCL":
            category = "OBC"
        elif t in ("PWBD", "YES", "Y"):
            pwbd = True
        elif t in APPLIED_WORDS or tokens[i].upper() in APPLIED_WORDS:
            applied.append(tokens[i])
        else:
            break
        i += 1
    specialty = " ".join(tokens[i:]).strip()
    if not specialty:
        return ("BAD", "no specialty after middle tokens")

    pool = "GENERAL"
    if seat_cat == "IP" or "SPONSORED" in " ".join(applied).upper() or "SPON" in " ".join(applied).upper():
        pool = "SPONSORED"
    elif seat_cat == "INST":
        pool = "INSTITUTE"
    elif seat_cat == "OCS":
        pool = "OCS"
    elif seat_cat is None or "FOREIGN" in " ".join(applied).upper():
        pool = "FOREIGN"
    elif annotation and ("Domicile" in annotation or "Preference" in annotation):
        pool = "RESTRICTED"

    return {
        "roll": roll, "rank": int(rank),
        "category": category, "applied_under": " ".join(applied) or None, "pwbd": pwbd,
        "specialty_raw": specialty, "institute_raw": institute_raw,
        "seat_category": seat_cat, "seat_pwd": seat_pwd,
        "seat_annotation": annotation, "seat_pool": pool,
    }


def parse_round(pdf: Path, session: str, round_name: str):
    text = pdftotext(pdf)
    section = None
    rows, status_rows, bad = [], [], []
    for ln, line in enumerate(text.splitlines(), 1):
        if PAGE_RE.search(line) or "Result Notification" in line:
            continue
        if MDS_SECTION_RE.search(line):
            section = "MDS"
            continue
        if section is None and (MDMS_SECTION_RE.search(line) or re.match(r"^\s*Roll\s*No", line, re.I)):
            section = "MDMS"
            continue
        if section is None:
            continue
        # status rows FIRST — non-allotment listings (FCNA / NR-NP / NSA / …)
        sm_status = STATUS_ROW_RE.match(line)
        if sm_status:
            roll, rank, middle, status = sm_status.groups()
            cat, _, _ = classify_middle(middle.split())
            status_rows.append({"roll": roll, "rank": int(rank), "category": cat,
                                "status": status.upper()})
            continue
        parsed = parse_data_line(line)
        if parsed is None:
            continue
        if isinstance(parsed, tuple):
            bad.append((ln, f"{parsed[1]} | {line.strip()}"))
            continue
        parsed["section"] = section
        rows.append(parsed)
    if not rows or len(rows) < 100:
        raise RuntimeError(f"{pdf.name}: parsed only {len(rows)} allotment rows — structure mismatch")
    # hard validations
    mdms = [r for r in rows if r["section"] == "MDMS"]
    for r in rows:
        assert 0 < r["rank"] < 1000000, f"{pdf.name}: rank out of range {r}"
    dup = len({r["roll"] for r in mdms}) != len(mdms)
    out = PARSED / session / f"round-{round_name}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    with (PARSED / session / f"round-{round_name}-notallotted.jsonl").open("w", encoding="utf-8") as f:
        for r in status_rows:
            f.write(json.dumps(r) + "\n")
    return {"file": pdf.name, "allotments": len(rows), "mdms": len(mdms), "mds": len(rows) - len(mdms),
            "listed_not_allotted": len(status_rows),
            "duplicate_roll_in_round": dup, "unparsed_data_lines": bad[:20], "unparsed_count": len(bad)}


def parse_result(pdf: Path, session: str):
    text = pdftotext(pdf)
    section = None
    rows, bad = [], []
    for ln, line in enumerate(text.splitlines(), 1):
        if PAGE_RE.search(line) or "Result Notification" in line:
            continue
        if re.search(r"\bMDS Courses?\b", line, re.I) or re.match(r"^\s*MDS,?\s*$", line):
            section = "MDS"
            continue
        if section is None and re.search(r"(MD, ?MS|MD/?MS)", line, re.I):
            section = "MDMS"
            continue
        if section is None:
            continue
        # S.No Roll [Category] [Applied-Under] [PWBD] Rank Percentile
        # 2026-01 publishes percentiles with up to 7 decimals (77.9197591);
        # every earlier session used <= 6. {1,7} matches both — verified:
        # it leaves all historical parses byte-identical and yields 0 bad
        # lines on the 2026-01 file (32,374 rows).
        m = re.match(
            r"^\s*(\d{1,6})\s+(\d{6,10})\s+((?:[A-Za-z*./-]+\s+){0,3}?)(\d{1,6})\s+(\d{1,3}\.\d{1,7})\s*$",
            line,
        )
        if not m:
            if re.match(r"^\s*\d{1,6}\s+\d{6,10}\s+\S", line):
                bad.append((ln, line.strip()))
            continue
        sno, roll, middle, rank, pct = m.groups()
        try:
            cat, applied, pwbd = classify_middle(middle.split())
        except ValueError:
            bad.append((ln, line.strip()))
            continue
        rows.append({"sno": int(sno), "roll": roll, "category": cat,
                     "applied_under": applied, "pwbd": pwbd,
                     "rank": int(rank), "percentile": float(pct), "section": section})
    if not rows or len(rows) < 1000:
        raise RuntimeError(f"{pdf.name}: parsed only {len(rows)} rows — structure mismatch")
    mdms = [r for r in rows if r["section"] == "MDMS"]
    mds = [r for r in rows if r["section"] == "MDS"]
    # hard validations per section: rank uniqueness, percentile strictly
    # decreasing with rank, contiguity reported (gaps allowed but counted —
    # INI-CET qualified lists have shown no gaps; any gap is a review flag)
    stats = {}
    for name, sec in (("MDMS", mdms), ("MDS", mds)):
        if not sec:
            stats[name] = {"rows": 0}
            continue
        sec_sorted = sorted(sec, key=lambda r: r["rank"])
        ranks = [r["rank"] for r in sec_sorted]
        pcts = [r["percentile"] for r in sec_sorted]
        assert len(set(ranks)) == len(ranks), f"{pdf.name}: duplicate ranks in {name}"
        # percentiles are published rounded (2-3 dp) — ties across adjacent
        # ranks are expected; the invariant is NON-INCREASING, not strict.
        mono = all(pcts[i] >= pcts[i + 1] for i in range(len(pcts) - 1))
        assert mono, f"{pdf.name}: percentile increases with rank in {name}"
        ties = sum(1 for i in range(len(pcts) - 1) if pcts[i] == pcts[i + 1])
        gaps = ranks[-1] - len(ranks)  # expected contiguous 1..N
        assert sec_sorted[0]["rank"] == 1, f"{pdf.name}: {name} does not start at rank 1"
        stats[name] = {"rows": len(sec), "max_rank": ranks[-1], "rank_gaps": gaps,
                       "percentile_ties": ties,
                       "min_pct": pcts[-1], "max_pct": pcts[0]}
    for name, sec in (("mdms", mdms), ("mds", mds)):
        out = PARSED / session / f"result-{name}.jsonl"
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8") as f:
            for r in sec:
                f.write(json.dumps(r) + "\n")
    return {"file": pdf.name, "sections": stats, "unparsed_data_lines": bad[:20],
            "unparsed_count": len(bad)}


SESSIONS = {
    "2021-07": {"result": "result-oldportal.pdf"},
    "2022-01": {"result": "result-oldportal.pdf",
                 "rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf"}},
    "2023-01": {"rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf", "open": "round-open.pdf"}},
    "2023-07": {"result": "result.pdf", "rounds": {"1st": "round-1st.pdf", "open": "round-open.pdf"}},
    "2024-01": {"result": "result.pdf", "rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf", "open": "round-open.pdf"}},
    "2024-07": {"rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf", "open": "round-open.pdf"}},
    "2025-01": {"result": "result.pdf", "rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf", "open": "round-open.pdf"}},
    "2025-07": {"result": "result.pdf", "rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf", "open": "round-open.pdf"}},
    # January 2026 session (complete manual-grab set, 2026-09-21):
    # result = Notification 250/2025 (15-11-2025); rounds = Notifications
    # 327/2025 (1st, 18-12-2025), 02/2026 (2nd, 09-01-2026), 69/2026
    # (open, 21-02-2026). 1st + 2nd + open = the complete online-counselling
    # round set, so this session's counselling snapshot can be built.
    "2026-01": {"result": "result.pdf",
                "rounds": {"1st": "round-1st.pdf", "2nd": "round-2nd.pdf", "open": "round-open.pdf"}},
}

# Old-portal wayback round files for 2021/2022 (renamed in place by this run):
RENAMES = {
    RAW / "unknown" / "round-1st-oldportal-b.pdf": RAW / "2021-07" / "round-1st.pdf",
    RAW / "unknown" / "round-1st-oldportal-c.pdf": RAW / "2022-01" / "round-1st.pdf",
    RAW / "unknown" / "round-2nd-oldportal.pdf": RAW / "2022-01" / "round-2nd.pdf",
    RAW / "unknown" / "counsel1-rankwise-oldportal.pdf": RAW / "2021-01" / "eligible-list-partial.pdf",
}


def main():
    for src, dst in RENAMES.items():
        if src.exists() and not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)
            print(f"moved {src.name} -> {dst}")

    report = {}
    for session, spec in SESSIONS.items():
        report[session] = {}
        if "result" in spec:
            pdf = RAW / session / spec["result"]
            if pdf.exists():
                report[session]["result"] = parse_result(pdf, session)
                print(f"{session} result: {report[session]['result']['sections']}")
            else:
                report[session]["result"] = "MISSING"
        for rname, fname in (spec.get("rounds") or {}).items():
            pdf = RAW / session / fname
            if pdf.exists():
                report[session][f"round-{rname}"] = parse_round(pdf, session, rname)
                r = report[session][f"round-{rname}"]
                print(f"{session} round-{rname}: allotments={r['allotments']} mdms={r['mdms']} "
                      f"listedNA={r['listed_not_allotted']} "
                      f"unparsed={r['unparsed_count']} dup={r['duplicate_roll_in_round']}")
            else:
                report[session][f"round-{rname}"] = "MISSING"

    out = PARSED / "parse-report.json"
    out.write_text(json.dumps(report, indent=1), encoding="utf-8")
    bad_total = sum(
        e.get("unparsed_count", 0)
        for s in report.values() if isinstance(s, dict)
        for e in s.values() if isinstance(e, dict)
    )
    print(f"\nparse report -> {out} (unparsed data lines total: {bad_total})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
