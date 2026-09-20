"""P2.7 — Official-PDF verification of mirror allotment rows via PyMuPDF.

Why fitz (documented per D2): Xpdf pdftotext (-table AND -layout) silently drops
rows on MCC's giant-page allotment PDFs (943/728 lines emitted for 26,889 rows).
fitz (PyMuPDF) is already installed — no new dependency.

For each official PDF: extract words with coordinates, group into visual rows by
y-baseline, parse (sno, rank, institute, course), then FULL-JOIN against the
mirror by rank and report agreement.

Usage: python scripts/phase2/verify_official_joins.py
"""
import csv
import json
import re
import sys
import io
from collections import defaultdict
from pathlib import Path

import fitz

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[2]
norm = lambda s: re.sub(r"\s+", "", s or "").lower()
COURSE = re.compile(r"^(M\.[DS]\.?|M\.Ch|M\.Sc|\(NBEMS|D\.M\.|DNB|PG.?Dip|Diploma)", re.I)
SKIP = re.compile(r"^(ABBR|NOTE|PAGE|NEET-PG|ROUND|SNO|RANK|ALL.*QUOTA|ALLOT|\*|\d+\.)", re.I)


def rows_from_pdf(pdf_path, first_page=1):
    doc = fitz.open(pdf_path)
    rows = []
    for pno in range(first_page - 1, len(doc)):
        page = doc[pno]
        words = page.get_text("words")  # (x0,y0,x1,y1,word,block,line,wordno)
        if page.rotation in (90, 270):
            # rotated landscape table: visual rows share x0.
            # rotation 90 -> read along decreasing y; 270 -> increasing y.
            buckets = defaultdict(list)
            for w in words:
                buckets[round(w[0] / 4) * 4].append(w)
            y_desc = page.rotation == 90
            for x in sorted(buckets):
                ws = sorted(buckets[x], key=lambda w: w[1], reverse=y_desc)
                rows.append([w[4] for w in ws])
        else:
            by_y = defaultdict(list)
            for w in words:
                by_y[round(w[1] / 3) * 3].append(w)
            for y in sorted(by_y):
                ws = sorted(by_y[y], key=lambda w: w[0])
                rows.append([w[4] for w in ws])
    doc.close()
    return rows


QUOTA_PREFIXES = [  # normalized known quota strings, longest first for prefix stripping
    norm(q) for q in [
        "Self-Financed Merit Seat/(Paid Seat Quota)", "Self-Financed Merit Seat",
        "Self- Financed Merit Seat", "Self-Financed", "IP University Quota",
        "IP University", "Delhi University Quota", "Delhi University",
        "Aligarh Muslim University", "Aligarh Muslim", "Banaras Hindu University",
        "Banaras Hindu", "Jain Minority Quota", "Muslim Minority Quota",
        "Non-Resident Indian", "Non- Resident Indian", "Armed Forces Medical",
        "All India", "DNB Quota",
    ]
]


def strip_quota(s_norm):
    s_norm = s_norm.lstrip("-")
    for q in QUOTA_PREFIXES:
        if s_norm.startswith(q):
            return s_norm[len(q):]
    return s_norm


def extract_seat(toks):
    """tokens -> (inst_norm, course_norm) for the FIRST allotment panel in tokens."""
    toks = [t for t in toks if t not in ("-", "--", "---")]
    cidx = None
    for i, t in enumerate(toks):
        if COURSE.match(t):
            cidx = i
            break
    if cidx is None or cidx == 0:
        return None
    return strip_quota(norm(" ".join(toks[:cidx]))), norm(" ".join(toks[cidx:]))


def is_data_lead(toks):
    return (len(toks) >= 5 and not SKIP.match(toks[0])
            and toks[0].isdigit()
            and (toks[1].isdigit() or not toks[1].isdigit()))


def parse_rows(raw_rows):
    """rank -> (inst_norm, course_norm). Merges each data line with its continuation
    line (records wrap across two visual lines). Handles R1-style (sno rank ...) and
    R2/R3 two-panel rows (rank [R1 panel] Reported [R2/R3 panel ...])."""
    out = {}
    i = 0
    while i < len(raw_rows):
        toks = raw_rows[i]
        if not (len(toks) >= 5 and toks[0].isdigit() and not SKIP.match(toks[0])):
            i += 1
            continue
        # merge continuation line if it is not itself a data lead
        merged = list(toks)
        if i + 1 < len(raw_rows):
            nxt = raw_rows[i + 1]
            if not (len(nxt) >= 2 and nxt[0].isdigit() and not SKIP.match(nxt[0])):
                merged += nxt
        if toks[1].isdigit():                       # sno rank style
            rank = int(toks[1])
            seat = extract_seat(merged[2:])
        else:                                       # two-panel style
            rank = int(toks[0])
            cut = None
            for j, t in enumerate(merged):
                if t in ("Reported", "Reported.", "Repo", "NotRepo"):
                    cut = j + 1
                    break
                if t == "Not" and j + 1 < len(merged) and merged[j+1] in ("Reported", "Repo"):
                    cut = j + 2
                    break
            if cut is None:
                i += 1
                continue
            right = merged[cut:]
            if not any(COURSE.match(t) for t in right):
                i += 1
                continue
            seat = extract_seat(right)
        if seat:
            out.setdefault(rank, seat)
        i += 1
    return out


def load_jsonl(p):
    return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines()]


def join_check(label, official, mirror):
    def prefix_agree(a, b, n):
        a, b = a[:n], b[:n]
        return a == b or (len(a) < n and a in b) or (len(b) < n and b in a)  # containment for wrapped truncation
    common = sorted(set(official) & set(mirror))
    inst_ok = course_ok = both = 0
    for rk in common:
        oi, oc = official[rk]
        mi, mc = mirror[rk]
        i_ok, c_ok = prefix_agree(oi, mi, 15), prefix_agree(oc, mc, 10)
        inst_ok += i_ok; course_ok += c_ok; both += (i_ok and c_ok)
    print(f"{label}")
    print(f"  official rows: {len(official)} | mirror rows: {len(mirror)} | common: {len(common)} "
          f"| official-only: {len(set(official)-set(mirror))} | mirror-only: {len(set(mirror)-set(official))}")
    print(f"  institute[:20]: {inst_ok}/{len(common)} ({100*inst_ok/max(1,len(common)):.1f}%)  "
          f"course[:10]: {course_ok}/{len(common)} ({100*course_ok/max(1,len(common)):.1f}%)  "
          f"both: {both}/{len(common)} ({100*both/max(1,len(common)):.1f}%)")
    shown = 0
    for rk in common:
        if not (prefix_agree(official[rk][0], mirror[rk][0], 15)
                and prefix_agree(official[rk][1], mirror[rk][1], 10)) and shown < 5:
            print(f"    diff rank {rk}: inst official={official[rk][0][:30]} mirror={mirror[rk][0][:30]}")
            print(f"                 course official={official[rk][1][:20]} mirror={mirror[rk][1][:20]}")
            shown += 1


def main():
    cro_files = {n: f"data/parsed/crockzo/round-{n}.jsonl" for n in (1, 2, 3)}
    cro = {n: {r["rank"]: (norm(r["institute_raw"]), norm(r["course_raw"]))
               for r in load_jsonl(p)} for n, p in cro_files.items()}

    rah = {}
    with open(ROOT / "data/raw/rahuldathu/R1.csv", newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.reader(f):
            if len(r) == 8 and r[1].strip().isdigit():
                rah[int(r[1])] = (norm(r[3]), norm(r[4]))

    for label, pdf, mirror, start in [
        ("crockzo R1 2025 vs official MCC R1 2025", "data/raw/mcc/mcc-r1-2025.pdf", cro[1], 2),
        ("crockzo R2 2025 vs official MCC R2 2025 (right panel = R2 seat)", "data/raw/mcc/mcc-r2-2025.pdf", cro[2], 3),
        ("crockzo R3 2025 vs official MCC R3 2025", "data/raw/mcc/mcc-r3-2025.pdf", cro[3], 3),
        ("rahuldathu R1 2024 vs official MCC R1 2024", "data/raw/mcc/mcc-r1-2024.pdf", rah, 2),
    ]:
        official = parse_rows(rows_from_pdf(ROOT / pdf, start))
        join_check(label, official, mirror)


if __name__ == "__main__":
    main()
