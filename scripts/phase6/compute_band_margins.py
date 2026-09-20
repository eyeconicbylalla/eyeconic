"""P6 — Compute branch-band margins from observed year-over-year cutoff drift.

Re-runnable, read-only. Grounds the possibility-banding margins (spec §12:
"exact banding is an implementation decision validated against the data") in
the two imported counselling years:

  2024 vs 2025 closing ranks are compared per EXACTLY-KEYED matched group
  (institute_key + course_key + quota + category + pwd — the M1 join key
  documented in name-normalization-v1). The absolute relative change
  |CR2025/CR2024 - 1| forms the drift distribution; its percentiles justify:

  BORDERLINE_MARGIN  (default 0.35)  ~ just above the observed p75
  ASPIRATIONAL_CAP   (default 0.75)  ~ beyond the observed p95

Caveats recorded with the constants in server/predictor/config.js:
  - matched subset = stable-string programs (5,872 of 21,341/23,886 groups);
    unmatched groups (new courses / mirror string drift) can move more
  - small seat-groups (1-4 seats) dominate counselling reality and are kept
    in the sample on purpose (filtering them out biases toward big programs
    and collapses the sample to 82 groups)
  - margins are provisional and recalibrated with real outcome data (P11)

Usage: python scripts/phase6/compute_band_margins.py
Skips cleanly if the gitignored normalized layer is absent.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_groups(year):
    path = ROOT / "data" / "normalized" / f"{year}-final-allotments.jsonl"
    if not path.exists():
        return None
    g = defaultdict(lambda: {"closing": 0, "count": 0})
    for line in path.open(encoding="utf-8"):
        r = json.loads(line)
        if r.get("quarantine_reasons"):
            continue
        k = (r["institute_key"], r["course_key"], r["quota"], r["allotted_category"], r["allotted_pwd"])
        g[k]["closing"] = max(g[k]["closing"], r["rank"])
        g[k]["count"] += 1
    return g


def pct(sorted_vals, p):
    i = min(len(sorted_vals) - 1, int(round(p / 100 * (len(sorted_vals) - 1))))
    return sorted_vals[i]


def main():
    g24, g25 = load_groups(2024), load_groups(2025)
    if g24 is None or g25 is None:
        print("SKIP: data/normalized/*.jsonl not present (gitignored; re-run Phase 2 ingestion to regenerate).")
        return 0

    common = set(g24) & set(g25)
    rel = sorted(abs(g25[k]["closing"] / g24[k]["closing"] - 1) for k in common)

    print("=" * 78)
    print("PHASE 6 BAND-MARGIN EVIDENCE — 2024->2025 closing-rank drift")
    print("=" * 78)
    print(f"groups 2024: {len(g24)}   groups 2025: {len(g25)}   exactly-keyed matched: {len(common)}")
    print(f"drift |CR25/CR24 - 1|:  median={pct(rel,50):.3f}  p75={pct(rel,75):.3f}  "
          f"p90={pct(rel,90):.3f}  p95={pct(rel,95):.3f}")
    print()
    print("Configured margins (server/predictor/config.js BRANCH_BANDS):")
    print("  BORDERLINE_MARGIN = 0.35   (~ just above p75: 3/4 of matched groups drifted less)")
    print("  ASPIRATIONAL_CAP  = 0.75   (~ beyond p95: extreme-tail drift territory)")
    print()
    by_cat = defaultdict(list)
    for k in common:
        by_cat[k[3]].append(abs(g25[k]["closing"] / g24[k]["closing"] - 1))
    for cat, vals in sorted(by_cat.items()):
        vals.sort()
        print(f"  {cat:4s}: n={len(vals):5d}  median={pct(vals,50):.3f}  p75={pct(vals,75):.3f}  p95={pct(vals,95):.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
