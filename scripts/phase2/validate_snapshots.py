"""P2.7 — Validate predictor-data snapshots against golden fixtures.

Re-runnable, read-only. Checks:
  - snapshot files parse and carry required metadata (provenance, ids)
  - structural invariants (row widths, enum consistency, closing>=opening)
  - golden-verified values (counts, bands, dictionary mappings, official anchors)
Exit code 0 = all green.

Usage: python scripts/phase2/validate_snapshots.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PD = ROOT / "server" / "predictor-data"
failures = []


def check(cond, label):
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        failures.append(label)


def main():
    gold = json.loads((PD / "golden/v1/goldens.json").read_text(encoding="utf-8"))["checks"]
    dist = json.loads((PD / "distribution/neet-pg-2025/v1/score-rank-bands.json").read_text(encoding="utf-8"))
    c25 = json.loads((PD / "counselling/neet-pg-2025/v1/closing-ranks.json").read_text(encoding="utf-8"))
    c24 = json.loads((PD / "counselling/neet-pg-2024/v1/closing-ranks.json").read_text(encoding="utf-8"))
    quota_map = json.loads((PD / "dictionaries/v1/quota.json").read_text(encoding="utf-8"))["mappings"]
    cat_map = json.loads((PD / "dictionaries/v1/category.json").read_text(encoding="utf-8"))["mappings"]

    # --- distribution snapshot ---
    g = gold["distribution_2025"]
    v = dist["validation"]
    check(dist["snapshot_id"] == "DS-NEETPG-DISTRIBUTION-2025-v1", "distribution: snapshot id")
    check(v["total_rows"] == g["total_rows"], f"distribution: total rows {v['total_rows']}")
    check(v["numeric_pairs"] == g["numeric_pairs"], f"distribution: numeric pairs {v['numeric_pairs']}")
    check(v["absent_score_rows"] == g["absent_rows"] and v["withheld_rows"] == g["withheld_rows"],
          "distribution: absent/withheld counts")
    check(int(dist["bands"]["707"][0]) == 1 and dist["bands"]["707"][2] == 1, "distribution: score 707 -> rank 1")
    check(dist["bands"]["707"] == g["max_score_band"] and dist["bands"]["695"] == g["band_695"],
          "distribution: pinned bands")
    check(v["crockzo_oracle"]["exact"] == g["oracle_exact"]
          and v["crockzo_oracle"]["checked"] == g["oracle_checked"],
          "distribution: crockzo oracle 66348/66349")
    # monotonicity of bands: as score decreases, min_rank must never decrease
    bands = [(int(s), b) for s, b in dist["bands"].items()]
    bands.sort(key=lambda x: -x[0])
    mono = all(bands[i][1][0] <= bands[i+1][1][0] for i in range(len(bands)-1))
    check(mono, "distribution: band monotonicity (score desc => rank asc)")

    # --- counselling snapshots ---
    for year, snap, gg in (("2025", c25, gold["counselling_2025"]),
                           ("2024", c24, gold["counselling_2024"])):
        check(snap["snapshot_id"] == f"DS-NEETPG-COUNSELLING-{year}-v1", f"counselling {year}: snapshot id")
        check(len(snap["rows"]) == gg["groups"], f"counselling {year}: groups {gg['groups']}")
        check(snap["load_stats"]["final_rows"] == gg["final_rows"],
              f"counselling {year}: final rows {gg['final_rows']}")
        check(snap["load_stats"]["quarantined"] == 0, f"counselling {year}: zero quarantined")
        widths_ok = all(len(r) == 8 for r in snap["rows"])
        check(widths_ok, f"counselling {year}: row width 8")
        idx_ok = all(0 <= r[0] < len(snap["institutes"]) and 0 <= r[1] < len(snap["courses"])
                     and 0 <= r[2] < len(snap["quota_enum"]) and 0 <= r[3] < len(snap["category_enum"])
                     for r in snap["rows"])
        check(idx_ok, f"counselling {year}: indices in range")
        logic_ok = all(r[5] >= r[6] and r[7] >= 1 and r[4] in (0, 1) for r in snap["rows"])
        check(logic_ok, f"counselling {year}: closing>=opening, count>=1")
        year_ok = snap["exam_year"] == int(year)
        check(year_ok, f"counselling {year}: year tag")

    # enums match dictionaries' canonical sets
    check(set(c25["quota_enum"]) <= {"AIQ","DU","IP","DNB","AMU","BHU","JM","MM","NRI","AFMS","SFMS"},
          "counselling 2025: quota enum canonical")
    check(set(c25["category_enum"]) == {"UR","EWS","OBC","SC","ST"}, "counselling 2025: category enum canonical")

    # --- dictionaries vs goldens ---
    dg = gold["dictionaries"]
    check(quota_map["AD"] == dg["AD"] and quota_map["AM"] == dg["AM"], "dict: AD=DNB, AM=AMU")
    check(quota_map["Self- Financed Merit Seat"] == dg["Self- Financed Merit Seat"], "dict: SFMS variants")
    gn = cat_map["GNYes"]
    check(gn["category"] == dg["GNYes"]["category"] and gn["pwd"] is True, "dict: GNYes -> UR+pwd")

    # --- rank-1 official anchor present in 2025 normalized layer ---
    row = None
    for line in (ROOT / "data/normalized/2025-final-allotments.jsonl").open(encoding="utf-8"):
        rec = json.loads(line)
        if rec.get("rank") == 1 and rec.get("round") == 1:
            row = rec
            break
    ga = gold["counselling_2025"]["rank1_official_row"]
    check(row is not None and row["quota"] == ga["quota"] and row["allotted_category"] == ga["allotted_category"]
          and row["course_raw"].upper().startswith("M.D. (GENERAL MEDICINE)")
          and row["institute_raw"].startswith("PGIMER, DR. RML Hospital"),
          "counselling 2025: rank-1 row matches official MCC R1 anchor")

    print()
    if failures:
        print(f"{len(failures)} FAILURES")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
