"""Phase 0 verification for the Rank & Branch Predictor M1 sources.

Verifies the three M1-critical datasets per docs/RANK_AND_BRANCH_PREDICTOR.md Section 18, Phase 0:
  1. NBEMS NEET-PG 2025 Notice Board Result PDF (official, score<->rank)  -- sampled pages
  2. github.com/crockzo/neet-pg 2025 rounds R1-R3 (mirror: rank+score+branch)
  3. github.com/rahuldathu/NEET-PG-College-Predictor-2025 2024 CSVs (mirror: rank+branch)

Run from repo root after downloading data into data/raw/ :
    python scripts/verify_phase0_sources.py

Writes data/verification/phase0_report.json and prints a summary.
Read-only: never modifies raw files.
"""
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "verification" / "phase0_report.json"

# ---------------------------------------------------------------- crockzo ----

def load_crockzo():
    """round-N/data.js files are `const ROUND_N_DATA = [...];` -> parse as JSON."""
    rounds = {}
    for n in (1, 2, 3):
        p = RAW / "crockzo" / f"round-{n}-data.js"
        text = p.read_text(encoding="utf-8")
        m = re.search(r"=\s*(\[.*\])\s*;?\s*$", text, re.S)
        if not m:
            raise ValueError(f"unexpected format in {p}")
        rounds[n] = json.loads(m.group(1))
    return rounds


def analyze_round(rows, label):
    stats = {"round": label, "rows": len(rows)}
    keys = sorted({k for r in rows for k in r})
    stats["keys"] = keys
    ranks, scores = [], []
    bad_score, bad_rank, missing_score = 0, 0, 0
    for r in rows:
        try:
            ranks.append(int(r["rank"]))
        except (ValueError, TypeError, KeyError):
            bad_rank += 1
        s = r.get("score")
        if s is None or s == "":
            missing_score += 1
        else:
            try:
                scores.append(int(s))
            except (ValueError, TypeError):
                bad_score += 1
    stats["rank_min_max"] = [min(ranks), max(ranks)] if ranks else None
    stats["unique_ranks"] = len(set(ranks))
    stats["score_min_max"] = [min(scores), max(scores)] if scores else None
    stats["bad_rank_values"] = bad_rank
    stats["bad_score_values"] = bad_score
    stats["missing_score"] = missing_score
    stats["quota_values"] = dict(Counter(r.get("quota") for r in rows))
    stats["allotted_category_values"] = dict(Counter(r.get("allottedCategory") for r in rows))
    stats["candidate_category_values"] = dict(Counter(r.get("candidateCategory") for r in rows))
    stats["remarks_values"] = dict(Counter(r.get("remarks") for r in rows))
    stats["distinct_institutes"] = len({r.get("institute") for r in rows})
    stats["distinct_courses"] = len({r.get("course") for r in rows})
    # monotonicity: as rank increases, score must never increase (ties allowed)
    pairs = sorted((int(r["rank"]), int(r["score"])) for r in rows
                   if str(r.get("score", "")).isdigit() and str(r.get("rank", "")).lstrip("-").isdigit())
    viol = [ (pairs[i], pairs[i+1]) for i in range(len(pairs)-1)
             if pairs[i+1][1] > pairs[i][1] ]
    stats["monotonicity_violations"] = len(viol)
    stats["monotonicity_examples"] = viol[:3]
    # rank -> scores map for the official-PDF join check
    return stats


# ------------------------------------------------------------ rahuldathu ----

def analyze_csv(path, has_header, expect_cols=None):
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        rows = list(reader)
    out = {"file": path.name, "rows_incl_header": len(rows)}
    if has_header:
        out["header"] = rows[0]
        rows = rows[1:]
    widths = Counter(len(r) for r in rows)
    out["row_widths"] = dict(widths)
    out["malformed_rows"] = sum(c for w, c in widths.items() if expect_cols and w != expect_cols)
    ranks = []
    for r in rows:
        if r:
            try:
                ranks.append(int(r[1]))
            except (ValueError, IndexError):
                pass
    out["rank_min_max"] = [min(ranks), max(ranks)] if ranks else None
    return out, rows


# ------------------------------------------------------------------ NBEMS ----

LINE_RE = re.compile(
    r"^\s*(\d{1,6})\s+(PG\d{6,12})\s+(\d{8,14})\s+(ABSENT|\d{1,3})?\s+(ABSENT|\d{1,6})?\s*$"
)

def parse_nbems_sample(txt_path):
    """Parse -layout pdftotext output. Returns rows + artifact counts."""
    rows, artifacts = [], 0
    for line in txt_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        m = LINE_RE.match(line)
        if m:
            sno, appid, roll, score, rank = m.groups()
            rows.append({"sno": int(sno), "appid": appid, "roll": roll,
                         "score": score, "rank": rank})
        else:
            artifacts += 1  # headers, wrapped/orphaned values, page furniture
    return rows, artifacts


# ------------------------------------------------------------------- main ----

def main():
    report = {"generated": "2026-09-19", "sources": {}}

    # 1. crockzo
    rounds = load_crockzo()
    crockzo = {"provenance": (RAW / "crockzo" / "PROVENANCE.txt").read_text().strip(),
               "rounds": [analyze_round(rows, f"R{n}") for n, rows in rounds.items()]}
    crockzo["total_rows"] = sum(r["rows"] for r in crockzo["rounds"])
    report["sources"]["crockzo_2025"] = crockzo

    # 2. rahuldathu
    rah = {"provenance": (RAW / "rahuldathu" / "PROVENANCE.txt").read_text().strip(), "files": {}}
    for name, header, cols in [("R1.csv", False, 8), ("R2.csv", False, 8),
                               ("R3.csv", False, 8),
                               ("final_seat_allocation.csv", True, None),
                               ("inference_table.csv", True, None)]:
        stats, rows = analyze_csv(RAW / "rahuldathu" / name, header, cols)
        rah["files"][name] = stats
    report["sources"]["rahuldathu_2024"] = rah

    # 3. NBEMS sample pages
    nbems = {"files": {}}
    all_sample = []
    for p in sorted((RAW / "nbems").glob("sample-p*.txt")):
        rows, artifacts = parse_nbems_sample(p)
        nbems["files"][p.name] = {"parsed_rows": len(rows), "unparsed_lines": artifacts}
        all_sample.extend(rows)
    numeric = [r for r in all_sample if (r["score"] or "").isdigit() and (r["rank"] or "").isdigit()]
    absent = sum(1 for r in all_sample if "ABSENT" in (r["score"], r["rank"]))
    blank_score = sum(1 for r in all_sample if r["score"] is None)
    nbems["sample_rows_total"] = len(all_sample)
    nbems["numeric_score_rank_pairs"] = len(numeric)
    nbems["absent_values"] = absent
    nbems["blank_score_rows"] = blank_score

    # join check: official PDF sample rank->score vs crockzo (any round)
    rank_to_scores = {}
    for rows in rounds.values():
        for r in rows:
            if str(r.get("score", "")).isdigit() and str(r.get("rank", "")).isdigit():
                rank_to_scores.setdefault(int(r["rank"]), set()).add(int(r["score"]))
    compared = matched = 0
    mismatches = []
    for r in numeric:
        rk, sc = int(r["rank"]), int(r["score"])
        if rk in rank_to_scores:
            compared += 1
            if sc in rank_to_scores[rk]:
                matched += 1
            else:
                mismatches.append({"pdf": {"rank": rk, "score": sc},
                                   "crockzo_scores": sorted(rank_to_scores[rk])})
    nbems["join_vs_crockzo"] = {"ranks_checked": compared, "exact_matches": matched,
                                "mismatches": mismatches[:10]}
    report["sources"]["nbems_2025_pdf_sample"] = nbems

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

    # summary
    print("=== PHASE 0 VERIFICATION SUMMARY ===")
    print(f"crockzo 2025: {crockzo['total_rows']} rows across 3 rounds")
    for r in crockzo["rounds"]:
        print(f"  R{r['round']}: {r['rows']} rows, ranks {r['rank_min_max']}, "
              f"scores {r['score_min_max']}, monotonicity violations: {r['monotonicity_violations']}")
    print(f"rahuldathu 2024:")
    for name, s in rah["files"].items():
        print(f"  {name}: {s['rows_incl_header']} lines, widths {s.get('row_widths')}, "
              f"ranks {s['rank_min_max']}")
    print(f"NBEMS PDF sample: {nbems['sample_rows_total']} rows parsed, "
          f"{nbems['numeric_score_rank_pairs']} numeric pairs, "
          f"{nbems['absent_values']} ABSENT, {nbems['blank_score_rows']} blank-score")
    j = nbems["join_vs_crockzo"]
    print(f"JOIN official-PDF vs crockzo: {j['exact_matches']}/{j['ranks_checked']} "
          f"sampled ranks reproduce the mirror's score exactly")
    if j["mismatches"]:
        print("  MISMATCHES:", json.dumps(j["mismatches"], indent=2))
    print(f"\nfull report: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
