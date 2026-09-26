"""P2.7 — Validate predictor-data snapshots against golden fixtures.

Re-runnable, read-only. Checks:
  - MANIFEST.json file_hashes match the on-disk bytes AND the committed git
    blob (production reads the blob bytes — a hash derived from locally
    line-ending-converted bytes passes local checks and fails in production)
  - snapshot files parse and carry required metadata (provenance, ids)
  - structural invariants (row widths, enum consistency, closing>=opening)
  - golden-verified values (counts, bands, dictionary mappings, official anchors)
Exit code 0 = all green.

Usage: python scripts/phase2/validate_snapshots.py
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PD = ROOT / "server" / "predictor-data"
failures = []


def check(cond, label):
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        failures.append(label)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def git_blob(rel: str):
    """Committed blob bytes at HEAD for a store-relative path, or None if
    git is unavailable / the file is not tracked yet (fresh ingestion)."""
    try:
        proc = subprocess.run(
            ["git", "cat-file", "blob", f"HEAD:server/predictor-data/{rel}"],
            cwd=ROOT, capture_output=True)
    except OSError:
        return None
    return proc.stdout if proc.returncode == 0 else None


def main():
    # --- MANIFEST integrity: MANIFEST == disk bytes == committed blob --------
    # server/predictor/store.js SHA-256-verifies every file against
    # MANIFEST.json at load time in whatever environment runs it; production
    # (Vercel, Linux) reads the git blob exactly as committed. A manifest hash
    # derived from a Windows working tree (CRLF via core.autocrlf) passes every
    # local check and then 500s in production. .gitattributes pins the store to
    # -text so the three byte streams cannot diverge; this proves they haven't.
    man = json.loads((PD / "MANIFEST.json").read_text(encoding="utf-8"))
    for rel, expected in sorted(man["file_hashes"].items()):
        p = PD / rel
        if not p.exists():
            check(False, f"manifest hash: {rel} exists on disk")
            continue
        check(sha256_bytes(p.read_bytes()) == expected,
              f"manifest hash: {rel} disk bytes match MANIFEST")
        blob = git_blob(rel)
        if blob is None:
            print(f"WARN  manifest hash: {rel} not at HEAD (uncommitted?) - blob check skipped")
        else:
            check(sha256_bytes(blob) == expected,
                  f"manifest hash: {rel} committed blob matches MANIFEST (deploy bytes)")

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

    # --- INI-CET (M2 Phase 1): distributions + counselling snapshots --------
    gi = gold["inicet"]
    for sess in gi["distributions"]["sessions"]:
        dist_i = json.loads(
            (PD / f"distribution/ini-cet-{sess}/v1/rank-percentile.json").read_text(encoding="utf-8"))
        yy, mm = sess.split("-")
        check(dist_i["snapshot_id"] == f"DS-INICET-DISTRIBUTION-{yy}{mm}-v1",
              f"inicet dist {sess}: snapshot id")
        v = dist_i["validation"]
        check(v["rows"] == len(dist_i["rows"]), f"inicet dist {sess}: rows field matches array")
        check(v["first_rank"] == 1 and dist_i["rows"][0][0] == 1,
              f"inicet dist {sess}: starts at rank 1")
        check(v["unique_ranks"] and v["percentile_nonincreasing"],
              f"inicet dist {sess}: unique ranks, non-increasing percentile")
        check(v["rows"] + v["rank_gaps"] == v["max_rank"],
              f"inicet dist {sess}: rows + gaps == max_rank (contiguous rank space)")
        check(dist_i["provenance"].get("sha256"), f"inicet dist {sess}: provenance sha256")
    gd = gi["distributions"]
    d75 = json.loads((PD / "distribution/ini-cet-2025-07/v1/rank-percentile.json").read_text(encoding="utf-8"))
    check(d75["validation"]["rows"] == gd["s2025_07"]["rows"]
          and d75["validation"]["max_rank"] == gd["s2025_07"]["max_rank"]
          and d75["validation"]["rank_gaps"] == gd["s2025_07"]["rank_gaps"]
          and abs(d75["validation"]["min_percentile"] - gd["s2025_07"]["min_pct"]) < 1e-9
          and d75["rows"][0][1] == 100_000_000,
          "inicet dist 2025-07: golden counts + rank-1 percentile 100.0")
    d17 = json.loads((PD / "distribution/ini-cet-2021-07/v1/rank-percentile.json").read_text(encoding="utf-8"))
    check(d17["validation"]["rows"] == gd["s2021_07"]["rows"]
          and d17["validation"]["max_rank"] == gd["s2021_07"]["max_rank"],
          "inicet dist 2021-07: golden counts (old-portal source)")
    # 2026-01: manual-browser-grab session (Notification 250/2025) — counts +
    # page-1 anchors reproduce exactly (rank 226 / 1525 straight off the PDF).
    d26 = json.loads((PD / "distribution/ini-cet-2026-01/v1/rank-percentile.json").read_text(encoding="utf-8"))
    g26 = gd["s2026_01"]
    by_rank = {r[0]: r[1] for r in d26["rows"]}
    check(d26["validation"]["rows"] == g26["rows"]
          and d26["validation"]["max_rank"] == g26["max_rank"]
          and d26["validation"]["rank_gaps"] == g26["rank_gaps"]
          and abs(d26["validation"]["min_percentile"] - g26["min_pct"]) < 1e-9
          and d26["rows"][0][1] == 100_000_000,
          "inicet dist 2026-01: golden counts + rank-1 percentile 100.0")
    check(by_rank.get(226) == g26["anchor_rank226_micros"]
          and by_rank.get(1525) == g26["anchor_rank1525_micros"],
          "inicet dist 2026-01: official page-1 anchors (rank 226 -> 99.6254026, rank 1525 -> 97.3533118)")

    for sess, gg in (("2025-07", gi["counselling_2025_07"]), ("2023-01", gi["counselling_2023_01"]),
                     ("2026-01", gi["counselling_2026_01"])):
        cs = json.loads((PD / f"counselling/ini-cet-{sess}/v1/closing-ranks.json").read_text(encoding="utf-8"))
        yy, mm = sess.split("-")
        check(cs["snapshot_id"] == f"DS-INICET-COUNSELLING-{yy}{mm}-v1", f"inicet couns {sess}: snapshot id")
        check(len(cs["rows"]) == gg["groups"], f"inicet couns {sess}: groups {gg['groups']}")
        check(len(cs["institutes"]) == gg["institutes"] and len(cs["courses"]) == gg["specialties"],
              f"inicet couns {sess}: institutes/specialties counts")
        check(cs["quota_enum"] == ["INI"], f"inicet couns {sess}: single counselling pool")
        check(set(cs["category_enum"]) == {"UR", "EWS", "OBC", "SC", "ST"},
              f"inicet couns {sess}: category enum canonical")
        check(all(len(r) == 8 for r in cs["rows"]), f"inicet couns {sess}: row width 8")
        check(all(0 <= r[0] < len(cs["institutes"]) and 0 <= r[1] < len(cs["courses"]) for r in cs["rows"]),
              f"inicet couns {sess}: indices in range")
        check(all(r[5] >= r[6] and r[7] >= 1 for r in cs["rows"]),
              f"inicet couns {sess}: closing>=opening, count>=1")

    c75 = json.loads((PD / "counselling/ini-cet-2025-07/v1/closing-ranks.json").read_text(encoding="utf-8"))
    check(c75["load_stats"]["seats_by_pool"]["GENERAL"] == gi["counselling_2025_07"]["general_pool"],
          "inicet couns 2025-07: general-pool seat count")
    # 2026-01 (complete manual-grab round set): final-state merge pins
    c26 = json.loads((PD / "counselling/ini-cet-2026-01/v1/closing-ranks.json").read_text(encoding="utf-8"))
    g26c = gi["counselling_2026_01"]
    check(c26["load_stats"]["final_rows"] == g26c["final_rows"]
          and c26["load_stats"]["rows_from"] == g26c["rows_from"]
          and c26["load_stats"]["seats_by_pool"]["GENERAL"] == g26c["general_pool"]
          and len(c26["institutes"]) == g26c["institutes"]
          and len(c26["courses"]) == g26c["specialties"],
          "inicet couns 2026-01: final-state merge pins (2618 from 1611/1274/754, 2218 general-pool)")
    check(max(r[5] for r in c26["rows"]) <= 31511,
          "inicet couns 2026-01: closing ranks within the qualified rank space (max <= 31511)")
    anchors = gi["anchors_2025_07"]

    def find_group(cs, inst, spec, cat):
        for r in cs["rows"]:
            if cs["institutes"][r[0]] == inst and cs["courses"][r[1]] == spec \
                    and cs["category_enum"][r[3]] == cat and r[4] == 0:
                return r
        return None

    r1 = find_group(c75, "AIIMS NEW DELHI", "GENERAL MEDICINE", "UR")
    check(r1 is not None and r1[5] == anchors["genmed_aiimsnd_ur"]["closing"]
          and r1[6] == anchors["genmed_aiimsnd_ur"]["opening"] and r1[7] == anchors["genmed_aiimsnd_ur"]["count"],
          "inicet couns 2025-07: AIIMS ND GenMed UR anchor (closing 4 / opening 2 / 3 seats — PDF ranks 2-4)")
    r2 = find_group(c75, "AIIMS NEW DELHI", "RADIODIAGNOSIS", "UR")
    check(r2 is not None and r2[5] == anchors["radiodiagnosis_aiimsnd_ur"]["closing"],
          "inicet couns 2025-07: AIIMS ND Radiodiagnosis UR anchor (closing 7)")
    r3 = find_group(c75, "NIMHANS BENGALURU", "NEUROLOGY [DIRECT 6-YEAR]", "UR")
    check(r3 is not None and r3[5] == anchors["neurology6_nimhans_ur"]["closing"],
          "inicet couns 2025-07: NIMHANS DM-Neurology-6yr UR anchor (closing 107; overall rank 1 held this seat)")

    # 2026-01 official anchors (Notification 327/2025 page 1: rank 1 = JIPMER
    # GenMed UR-37, rank 2 = AIIMS ND Radiodiagnosis, ranks 3/5/6 = AIIMS ND Medicine)
    a26 = gi["anchors_2026_01"]
    r26 = find_group(c26, "AIIMS NEW DELHI", "GENERAL MEDICINE", "UR")
    check(r26 is not None and r26[5] == a26["genmed_aiimsnd_ur"]["closing"]
          and r26[6] == a26["genmed_aiimsnd_ur"]["opening"] and r26[7] == a26["genmed_aiimsnd_ur"]["count"],
          "inicet couns 2026-01: AIIMS ND GenMed UR anchor (closing 6 / opening 3 / 3 seats)")
    r27 = find_group(c26, "AIIMS NEW DELHI", "RADIODIAGNOSIS", "UR")
    check(r27 is not None and r27[5] == a26["radiodiagnosis_aiimsnd_ur"]["closing"],
          "inicet couns 2026-01: AIIMS ND Radiodiagnosis UR anchor (closing 2 — overall rank 2)")
    r28 = find_group(c26, "JIPMER PUDUCHERRY", "GENERAL MEDICINE", "UR")
    check(r28 is not None and r28[5] == a26["genmed_jipmer_ur"]["closing"] and r28[6] == a26["genmed_jipmer_ur"]["opening"],
          "inicet couns 2026-01: JIPMER GenMed UR anchor (opening 1 — overall rank 1 held this seat)")

    # --- INI-CET crowd prior (Phase 5 weak-step bridge) ----------------------
    gp = gold.get("inicet_prior")
    if gp:
        prior = json.loads((PD / "priors/inicet/v1/hazra-corrects-air.json").read_text(encoding="utf-8"))
        pts = sorted(prior["runtime_points"], key=lambda p: -p["corrects"])
        check(prior["snapshot_id"] == gp["prior_id"], "inicet prior: snapshot id")
        check(prior["source"]["type"] == "crowd-sourced" and prior["source"]["ur_only"] is gp["ur_only"],
              "inicet prior: crowd-sourced + UR-only provenance")
        check(len(pts) == gp["points"] and all(pts[i]["air"] < pts[i + 1]["air"] for i in range(len(pts) - 1)),
              "inicet prior: 7 monotone ladder points")
        check([pts[-1]["corrects"], pts[0]["corrects"]] == gp["corrects_span"]
              and [pts[0]["air"], pts[-1]["air"]] == gp["air_span"],
              "inicet prior: spans pinned")
        a = gp["anchors"]
        by_c = {p["corrects"]: p["air"] for p in pts}
        check(by_c[140] == a["corrects_140"] and by_c[120] == a["corrects_120"],
              "inicet prior: ladder anchors (140c->1000, 120c->10000)")

    print()
    if failures:
        print(f"{len(failures)} FAILURES")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
