"""Phase C — build the INI-CET corrects→AIR prior v2 (session 2027-01).

Source: the r/INICET "INICET NOV 2026 RANKS" community compilation
(operator screenshot 2026-11-14): 39 self-reported (correct, incorrect,
score/200, AIR) rows for the CBT held 01-11-2026.

Method (every step deterministic, no curve fitting):
 1. Each row's REPORTED SCORE (the physical marks that produced the rank)
    is normalized to the no-skip-equivalent corrects the engine's pattern
    arithmetic assigns those marks to:  c' = (3*marks + 200) / 4
    (exact inverse of scoreForCorrects; identical to the compilation
    sheet's own "TOTAL CORRECT IF ALL 200 ATTEMPTED" column).
 2. Rows are pooled into EXPLICIT buckets below (c'-ranges chosen where
    the reports cluster; each bucket becomes ONE rung at its c' midpoint
    with AIR = geometric mean of the bucket's reported AIRs).
 3. Monotonicity is asserted (more corrects => strictly better AIR).
 4. Single-report rungs keep qualifier 'single-report'; pooled rungs '~'.
    Every value remains a crowd self-report — the file stays labelled
    crowd-sourced/UR-only and every runtime warning stays.

One sheet typo is reconciled from the sheet's own last column:
126.3 marks listed at AIR "2,215", normalized column says 1,215 -> 1,215
(with 2,215 the 39 points are NOT monotone; with 1,215 they are, 39/39).

Excluded (kept as cross_check_points in the file, never runtime):
 - "Rank 27* / 155 corrects / 140 marks" self-post (asterisked rank,
   inconsistent with the table's 142 marks -> AIR 192; likely category rank)
 - pre-result predictions (all contradicted by actuals)
 - search snippet "~100 marks -> AIR 5-6k" (conflicts with the table's 8,900)

Outputs: server/predictor-data/priors/inicet/v2/corrects-air-202701.json
(LF) + MANIFEST.json entry. Goldens/validator pins are updated separately.
"""
import hashlib
import json
import math
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PD = ROOT / "server" / "predictor-data"
DEST = PD / "priors" / "inicet" / "v2" / "corrects-air-202701.json"

# (correct, incorrect, AIR) — reported score = correct - incorrect/3
# AIR 1,215 row entered with the reconciled rank (see docstring).
SOURCE_ROWS = [
    (170, 29, 4), (169, 29, 5), (168, 30, 7), (166, 28, 8), (166, 29, 9),
    (161, 23, 17), (163, 31, 20), (163, 33, 25),
    (159, 26, 35), (159, 26, 38), (161, 34, 40), (161, 35, 46), (159, 32, 59),
    (158, 41, 120), (157, 42, 160), (155, 39, 192),
    (154, 46, 320), (149, 41, 400),
    (146, 49, 800), (145, 45, 840),
    (143, 50, 1180), (143, 51, 1215),
    (141, 56, 1911),
    (137, 60, 2900),
    (129, 42, 3200), (136, 63, 3500), (131, 53, 3800), (132, 60, 4200),
    (135, 65, 5000), (130, 61, 5300), (128, 61, 5700),
    (125, 75, 8900),
    (117, 60, 10300),
    (114, 60, 11900), (117, 70, 12200), (114, 63, 12700), (113, 73, 13600),
    (113, 87, 18771),
    (110, 90, 21000),
]

# Explicit pooling buckets: (c' range low, c' range high) — c' midpoints
# become the rung corrects; AIR = geomean of bucket members.
BUCKETS = [
    (169.0, 171.0),   # top pair 169.5..170.2 (AIRs 4,5)
    (167.0, 169.0),   # 167.25..168.5 (AIRs 7,8,9)
    (164.0, 165.5),   # 164.0..165.0 (AIRs 17,20,25)
    (161.0, 163.0),   # 161.2..162.7 (AIRs 35..59)
    (157.5, 159.0),   # single 158.25 (AIR 120)
    (155.5, 157.5),   # 156.5..157.25 (AIRs 160,192)
    (151.0, 154.5),   # 151.5..154.0 (AIRs 320,400)
    (146.0, 149.0),   # the two 147.5s (AIRs 800,840)
    (143.5, 145.5),   # 144.7..145.25 (AIRs 1180,1215)
    (140.5, 142.5),   # single 141.7 (AIR 1911)
    (135.0, 138.5),   # 136.25..137.75 (AIRs 2900,3200,3500)
    (130.0, 135.0),   # 130.8..134.98 (AIRs 3800..5700)
    (123.5, 126.5),   # single 125.0 (AIR 8900)
    (122.0, 123.4),   # single 122.75 (AIR 10300)
    (118.8, 121.5),   # 119.75..120.5 (AIRs 11900,12200,12700)
    (115.5, 117.5),   # single 116.5 (AIR 13600)
    (111.5, 114.5),   # single 113.0 (AIR 18771)
    (108.5, 111.0),   # floor 110.0 (AIR 21000)
]


def equiv_corrects(marks):
    return (3.0 * marks + 200.0) / 4.0


def geomean(xs):
    return math.exp(sum(math.log(x) for x in xs) / len(xs))


def main():
    pts = []
    for correct, wrong, air in SOURCE_ROWS:
        marks = correct - wrong / 3.0
        pts.append((equiv_corrects(marks), air, correct, wrong, marks))
    pts.sort(key=lambda p: -p[0])

    # every source row must land in exactly one bucket
    rungs = []
    used = set()
    for lo, hi in BUCKETS:
        members = [p for p in pts if lo <= p[0] <= hi]
        assert members, f"bucket {lo}-{hi} has no members"
        for p in members:
            used.add(p)
        c_mid = round((max(p[0] for p in members) + min(p[0] for p in members)) / 2, 2)
        rungs.append({
            "session": "2027-01",
            "corrects": c_mid,
            "air": round(geomean([p[1] for p in members])),
            "air_qualifier": "single-report" if len(members) == 1 else "~",
            "pooled_from": len(members),
        })
    leftover = [p for p in pts if p not in used]
    assert not leftover, f"unbucketed source rows: {leftover}"

    rungs.sort(key=lambda r: -r["corrects"])
    for a, b in zip(rungs, rungs[1:]):
        assert a["air"] < b["air"], f"not monotone: {a} -> {b}"

    snap = {
        "dataset_kind": "corrects_to_air_prior",
        "format": "ladder-points-v1",
        "format_doc": [
            "points: corrects -> AIR ladder for one exam session (monotone: more corrects => better (smaller) AIR)",
            "corrects values are NO-SKIP-EQUIVALENT: the corrects count whose pattern arithmetic "
            "(200Q +1/-1/3, no skips) equals each report's actual marks — c = (3*marks+200)/4 — so the "
            "ladder composes exactly with the engine's scoreForCorrects step",
            "air values are CROWD SELF-REPORTS compiled by the community (approximate; '~' = pooled from "
            "several reports, 'single-report' = one direct report), never ground truth",
            "cross_check_points: excluded/conflicting reports kept for consistency reporting only, never runtime",
        ],
        "exam": "INI-CET",
        "session": "2027-01",
        "source": {
            "type": "crowd-sourced",
            "compiler": "r/INICET community compilation thread 'INICET NOV 2026 RANKS' (39 self-reported rows)",
            "obtained_by": "operator screenshot pasted 2026-11-14; transcribed + pooled by scripts/phaseC/build_inicet_prior_v2.py",
            "ur_only": True,
            "reliability_disclaimer": (
                "self-reported marks with no official ground truth (AIIMS publishes no marks); pooled with "
                "geometric means over explicit clusters, monotonicity asserted; treat as a labelled prior only"
            ),
        },
        "runtime_points": rungs,
        "source_points": [
            {"correct": c, "incorrect": w, "marks": round(c - w / 3.0, 3),
             "equiv_corrects": round(equiv_corrects(c - w / 3.0), 3), "air": a}
            for c, w, a in sorted(SOURCE_ROWS, key=lambda r: r[2])
        ],
        "cross_check_points": [
            {"session": "2027-01", "marks": 140, "air": 27, "expect": "outlier",
             "note": "excluded self-post 'Rank 27*' (asterisked; 155c/45w) — inconsistent with the table's "
                     "142 marks -> AIR 192; likely a category rank"},
            {"session": "2027-01", "marks": 100, "air": 5500,
             "note": "independent thread snippet '~100 marks -> AIR 5-6k' (midpoint 5,500) vs the table's "
                     "own 100m -> AIR 8,900 row: agrees within one crowd-noise band (x1.6) — corroborating "
                     "cross-check, not an outlier"},
        ],
        "notes": [
            "RUNTIME pairs with the official distribution anchor DS-INICET-DISTRIBUTION-202701-v1 "
            "(same session) — the v1 ladder/anchor pair (Hazra Jul-2025 x DS-...-202507-v1) remains "
            "committed for re-deriving stored records",
            "one sheet typo reconciled from the sheet's own normalized column: 126.3 marks at AIR "
            "'2,215' read as 1,215 (with 2,215 the 39 reports are non-monotone; with 1,215 they are)",
            "UR-only labelling retained (reporter categories unknown); reserved categories keep the "
            "PRIOR_UR_ONLY warning",
            "phase B drift context: same marks bought ~8x worse ranks at the top vs the Jul-2025 "
            "ladder (docs/RANK_PREDICTOR_PHASEB_DRIFT_MEMO.md)",
        ],
        "validation": {
            "points": len(rungs),
            "source_points": len(SOURCE_ROWS),
            "monotone": True,
            "corrects_span": [rungs[-1]["corrects"], rungs[0]["corrects"]],
            "air_span": [rungs[-1]["air"], rungs[0]["air"]],
        },
        "snapshot_id": "PR-INICET-CORRECTS-AIR-202701-v1",
    }

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(snap), encoding="utf-8", newline="\n")
    print(f"wrote {DEST.relative_to(ROOT)}")

    # MANIFEST entry (same shape as the v1 prior entry; LF discipline via -text attr)
    man_path = PD / "MANIFEST.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    entry = {
        "id": snap["snapshot_id"],
        "file": str(DEST.relative_to(PD)).replace("\\", "/"),
        "kind": "corrects_to_air_prior",
        "source": "crowd-sourced:r/INICET Nov-2026 compilation (39 rows, pooled 2026-11-14)",
        "points": len(rungs),
        "ur_only": True,
    }
    man["snapshots"] = [e for e in man["snapshots"] if e.get("id") != entry["id"]]
    man["snapshots"].append(entry)
    man["snapshots"].sort(key=lambda e: e["id"])
    man["file_hashes"][entry["file"]] = hashlib.sha256(DEST.read_bytes()).hexdigest()
    man["file_hashes"] = dict(sorted(man["file_hashes"].items()))
    man_path.write_text(json.dumps(man, indent=1), encoding="utf-8", newline="\n")
    print(f"MANIFEST updated: {len(man['snapshots'])} snapshots")

    for r in rungs:
        print(f"  {r['corrects']:>7.2f}c' -> AIR {r['air']:>6,}  ({r['air_qualifier']}, pooled {r['pooled_from']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
