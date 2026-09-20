"""P2.4/P2.5 — FINAL-STATE closing-rank snapshots (approved 2026-09-19).

Semantics (approved):
  2025: crockzo R1+R2+R3 union, deduped by rank, LATEST round wins (R3 > R2 > R1).
        R2/R3 files are changes-only lists; the deduped union IS the final state.
  2024: rahuldathu final_seat_allocation.csv IS the final state (one row per rank).

Round-level raw data is untouched in data/parsed/ and preserved row-by-row in the
normalized layer (round field kept) for future per-round analysis.

Usage:
  python scripts/phase2/build_counselling_snapshot.py --year 2025
  python scripts/phase2/build_counselling_snapshot.py --year 2024
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DICT = ROOT / "server" / "predictor-data" / "dictionaries" / "v1"
QUOTA = json.loads((DICT / "quota.json").read_text(encoding="utf-8"))
CATEGORY = json.loads((DICT / "category.json").read_text(encoding="utf-8"))


def norm_key(s):
    return re.sub(r"\s+", " ", (s or "")).strip().casefold()


def load_final_records(year):
    """Return (final_records, stats) with one record per rank."""
    if year == 2025:
        final = {}           # rank -> record (later rounds overwrite)
        stats = {"final_rows_from": defaultdict(int), "total_listed": 0,
                 "ranks_in_multiple_rounds": 0}
        seen = defaultdict(list)
        for rnd in (1, 2, 3):
            path = ROOT / f"data/parsed/crockzo/round-{rnd}.jsonl"
            for line in path.open(encoding="utf-8"):
                rec = json.loads(line)
                stats["total_listed"] += 1
                seen[rec["rank"]].append(rnd)
                final[rec["rank"]] = {**rec, "round": rnd}
        for rank, rnds in seen.items():
            if len(rnds) > 1:
                stats["ranks_in_multiple_rounds"] += 1
        for rec in final.values():
            stats["final_rows_from"][f"R{rec['round']}"] += 1
        prov = ("mirror:crockzo/neet-pg@4c2a796e4af57ebc112eaa6cad0b8fa558d3e80c "
                "(official MCC R1-R3 2025 changes-lists; final state = deduped union, latest round wins)")
        return list(final.values()), dict(stats), prov
    else:
        recs, bad = [], 0
        path = ROOT / "data/parsed/rahuldathu/final_seat_allocation.jsonl"
        for line in path.open(encoding="utf-8"):
            rec = json.loads(line)
            # final table: round_raw records the round the FINAL allotment occurred in
            rec["round"] = 0                    # final-state marker
            rec["final_allotment_round_raw"] = rec.pop("round_raw", None)
            recs.append(rec)
        prov = ("mirror:rahuldathu/NEET-PG-College-Predictor-2025@b5c0824a5068bcaef5ad990dee58389f46d37b03 "
                "(official MCC 2024 derived; file is the final seat allocation, one row per rank)")
        return recs, {"total_listed": len(recs), "bad_rows": bad}, prov


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True, choices=[2024, 2025])
    args = ap.parse_args()

    records, load_stats, provenance = load_final_records(args.year)

    norm_dir = ROOT / "data" / "normalized"
    val_dir = ROOT / "data" / "validated"
    snap_dir = ROOT / "server" / "predictor-data" / "counselling" / f"neet-pg-{args.year}" / "v1"
    for d in (norm_dir, val_dir, snap_dir):
        d.mkdir(parents=True, exist_ok=True)

    norm_path = norm_dir / f"{args.year}-final-allotments.jsonl"
    quar_path = val_dir / f"{args.year}-final-quarantine.jsonl"
    stats = {"final_rows": len(records), "quarantined": 0,
             "quarantine_reasons": defaultdict(int), **load_stats}
    groups = defaultdict(lambda: {"closing": 0, "opening": 10**9, "count": 0,
                                  "institute": None, "course": None})

    with norm_path.open("w", encoding="utf-8") as fout, quar_path.open("w", encoding="utf-8") as fq:
        for rec in records:
            q = QUOTA["mappings"].get(rec["quota_raw"])
            ac = CATEGORY["mappings"].get(rec["allotted_category_raw"])
            cc = CATEGORY["mappings"].get(rec["candidate_category_raw"])
            rec["quota"] = q
            rec["allotted_category"] = ac["category"] if ac else None
            rec["allotted_pwd"] = ac["pwd"] if ac else None
            rec["candidate_category"] = cc["category"] if cc else None
            rec["candidate_pwd"] = cc["pwd"] if cc else None
            rec["institute_key"] = norm_key(rec["institute_raw"])
            rec["course_key"] = norm_key(rec["course_raw"])

            reasons = []
            if q is None:
                reasons.append(f"quota_unmapped:{rec['quota_raw']!r}")
            if ac is None:
                reasons.append(f"allotted_category_unmapped:{rec['allotted_category_raw']!r}")
            if reasons:
                stats["quarantined"] += 1
                for r in reasons:
                    stats["quarantine_reasons"][r] += 1
                rec["quarantine_reasons"] = reasons
                fq.write(json.dumps(rec, ensure_ascii=False) + "\n")
                fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
                continue

            fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
            g = groups[(rec["institute_key"], rec["course_key"], q,
                        ac["category"], ac["pwd"])]
            g["closing"] = max(g["closing"], rec["rank"])
            g["opening"] = min(g["opening"], rec["rank"])
            g["count"] += 1
            g["institute"] = rec["institute_raw"]
            g["course"] = rec["course_raw"]

    # compact indexed serialization
    inst_list = sorted({k[0] for k in groups})
    inst_idx = {v: i for i, v in enumerate(inst_list)}
    course_list = sorted({k[1] for k in groups})
    course_idx = {v: i for i, v in enumerate(course_list)}
    quota_enum = sorted({k[2] for k in groups})
    quota_idx = {v: i for i, v in enumerate(quota_enum)}
    cat_enum = sorted({k[3] for k in groups})
    cat_idx = {v: i for i, v in enumerate(cat_enum)}
    display = {}
    for (ik, ck, q, cat, pwd), g in groups.items():
        display.setdefault(("i", ik), g["institute"])
        display.setdefault(("c", ck), g["course"])

    rows = []
    for (ik, ck, q, cat, pwd), g in sorted(groups.items()):
        rows.append([inst_idx[ik], course_idx[ck], quota_idx[q], cat_idx[cat],
                     1 if pwd else 0, g["closing"], g["opening"], g["count"]])

    snapshot = {
        "snapshot_id": f"DS-NEETPG-COUNSELLING-{args.year}-v1",
        "dataset_kind": "counselling_closing_ranks_FINAL_STATE",
        "format": "indexed-v1",
        "format_doc": [
            "rows: [institute_idx, course_idx, quota_idx, category_idx, pwd(0/1), closing_rank, opening_rank, allotted_count]",
            "FINAL-STATE semantics: one record per candidate as of the end of counselling (2025: deduped union of R1-R3 change-lists, latest round wins; 2024: final seat allocation file).",
            "R2/R3 changes-only files are NOT standalone closing-rank tables (approved decision 2026-09-19).",
            "Round-level rows with full provenance are preserved in data/normalized/ for future per-round analysis.",
        ],
        "exam": "NEET PG", "exam_year": args.year, "counselling": "MCC AIQ + central quotas",
        "pattern_version": "800-scale (+4/-1)",
        "load_stats": {k: (dict(v) if isinstance(v, defaultdict) else v) for k, v in stats.items()},
        "provenance": provenance,
        "dictionaries": ["quota-v1", "category-v1", "name-normalization-v1"],
        "quota_enum": quota_enum,
        "category_enum": cat_enum,
        "notes": [
            "closing = max AIR, opening = min AIR per (institute x course x quota x category x pwd) over the final state",
            "raw values preserved alongside canonical in the normalized layer",
            "separation rule: rank->branch ONLY; score->rank lives in the distribution snapshots",
        ],
        "institutes": [display[("i", k)] for k in inst_list],
        "courses": [display[("c", k)] for k in course_list],
        "rows": rows,
    }
    out = snap_dir / "closing-ranks.json"
    out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")

    print(f"year {args.year}: final_rows={stats['final_rows']}  groups={len(rows)}  "
          f"quarantined={stats['quarantined']}")
    if "final_rows_from" in stats:
        print("  final rows sourced from:", stats["final_rows_from"])
    if stats["quarantine_reasons"]:
        print("  QUARANTINE:", dict(stats["quarantine_reasons"]))
    cats = defaultdict(int)
    for r in rows:
        cats[cat_enum[r[3]]] += 1
    print("  groups by category:", dict(cats))
    quotas = defaultdict(int)
    for r in rows:
        quotas[quota_enum[r[2]]] += 1
    print("  groups by quota:", dict(quotas))
    print(f"  snapshot: {out} ({out.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
