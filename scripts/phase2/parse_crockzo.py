"""P2.2 — Parse crockzo/neet-pg 2025 round data.js into the parsed layer.

Input : data/raw/crockzo/round-{1,2,3}-data.js  (pinned commit in PROVENANCE.txt)
Output: data/parsed/crockzo/round-{1,2,3}.jsonl + parse report to stdout.

Deterministic, read-only on raw. Every output row carries source provenance.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "crockzo"
OUT = ROOT / "data" / "parsed" / "crockzo"

PROV = {
    "source": "mirror:crockzo/neet-pg",
    "upstream_commit": "4c2a796e4af57ebc112eaa6cad0b8fa558d3e80c",
    "exam": "NEET PG",
    "exam_year": 2025,
    "counselling_authority": "MCC",
    "parsed_at": "2026-09-19",
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    all_quotas, all_allotted, all_cand, all_remarks = Counter(), Counter(), Counter(), Counter()
    total = 0
    for n in (1, 2, 3):
        text = (RAW / f"round-{n}-data.js").read_text(encoding="utf-8")
        rows = json.loads(re.search(r"=\s*(\[.*\])\s*;?\s*$", text, re.S).group(1))
        out_path = OUT / f"round-{n}.jsonl"
        with out_path.open("w", encoding="utf-8") as f:
            for r in rows:
                rec = {
                    **PROV,
                    "round": n,
                    "sno": r["sno"],
                    "rank": int(r["rank"]),
                    "score_raw": r["score"],
                    "score": int(r["score"]),
                    "quota_raw": r["quota"],
                    "institute_raw": r["institute"],
                    "state_raw": r.get("state"),
                    "course_raw": r["course"],
                    "allotted_category_raw": r["allottedCategory"],
                    "candidate_category_raw": r["candidateCategory"],
                    "remarks_raw": r["remarks"],
                }
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                all_quotas[r["quota"]] += 1
                all_allotted[r["allottedCategory"]] += 1
                all_cand[r["candidateCategory"]] += 1
                all_remarks[r["remarks"]] += 1
        total += len(rows)
        print(f"round-{n}: {len(rows)} rows -> {out_path.name}")
    print(f"TOTAL: {total}")
    print("\nOBSERVED quota_raw:", json.dumps(all_quotas, indent=1))
    print("OBSERVED allotted_category_raw:", json.dumps(all_allotted, indent=1))
    print("OBSERVED candidate_category_raw:", json.dumps(all_cand, indent=1))
    print("OBSERVED remarks_raw:", json.dumps(all_remarks, indent=1))


if __name__ == "__main__":
    sys.exit(main())
