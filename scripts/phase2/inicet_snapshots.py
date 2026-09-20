"""INI-CET (M2 Phase 1) — build committed snapshots from the parsed layer.

Outputs (server/predictor-data, MANIFEST.json updated + golden-checked):
  distribution/ini-cet-<YYYY-MM>/v1/rank-percentile.json
      rank -> percentile mapping of QUALIFIED MD/MS candidates (the exam-wide
      list has a separate MDS rank space — excluded; MD/MS is the product's
      audience). rows: [[rank, percentile_micros]] percentile to 6 dp.
  counselling/ini-cet-<YYYY-MM>/v1/closing-ranks.json
      FINAL-STATE closing ranks per institute x specialty x seat-category x
      pwd over rounds 1st -> 2nd -> open (latest-wins by roll; mock rounds
      excluded — they are indicative, not allotments). Only sessions with a
      COMPLETE round set are committed; sponsored/foreign/institute/OCS/
      domicile-preference pools are counted but excluded from rows (separate
      counselling pools, spec §3.6 single-pool scope).

Snapshots carry full provenance (source URL + sha256 from download-log.json).
"""
import hashlib
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARSED = ROOT / "data" / "parsed" / "aiims"
RAWLOG = ROOT / "data" / "raw" / "aiims" / "download-log.json"
PD = ROOT / "server" / "predictor-data"

DIST_SESSIONS = ["2021-07", "2022-01", "2023-07", "2024-01", "2025-01", "2025-07"]
# complete round sets only (1st + 2nd + open)
COUNS_SESSIONS = ["2023-01", "2024-01", "2024-07", "2025-01", "2025-07"]
ROUND_ORDER = ["1st", "2nd", "open"]

CATEGORIES = ["UR", "EWS", "OBC", "SC", "ST"]

# ---- specialty canonicalization (spec §17: name chaos is where ingestion
# mistakes hide — every merge below is an obvious synonym/spelling/abbreviation
# of the same officially-taught course; anything not clearly identical stays
# distinct). Canonical form: uppercase, no parenthetical abbreviations.
SPECIALTY_ALIASES = {
    "ANAESTHESIA": "ANAESTHESIOLOGY", "ANESTHESIA": "ANAESTHESIOLOGY",
    "ANESTHESIOLOGY": "ANAESTHESIOLOGY", "ANESHTESIOLOGY": "ANAESTHESIOLOGY",
    "BIO-CHEMISTRY": "BIOCHEMISTRY", "BIOCHENMISTRY": "BIOCHEMISTRY",
    "LAB. MEDICINE": "LABORATORY MEDICINE", "LAB MEDICINE": "LABORATORY MEDICINE",
    "MEDICINE": "GENERAL MEDICINE", "INTERNAL MEDICINE": "GENERAL MEDICINE",
    "RADIOLOGY": "RADIODIAGNOSIS",
    "RADIODIAGNOSIS & IMAGING": "RADIODIAGNOSIS",
    "RADIODIAGNOSIS AND IMAGING": "RADIODIAGNOSIS",
    "RADIODIAGNOSIS & INTERVENTIONAL RADIOLOGY": "RADIODIAGNOSIS",
    "RADIODIAGNOSIS & INTERNVENTIONAL RADIOLOGY": "RADIODIAGNOSIS",  # official typo
    "DIAGNOSTIC & INTERVENTIONAL RADIOLOGY": "RADIODIAGNOSIS",
    "DIAGNOSTIC AND INTERVENTIONAL RADIOLOGY": "RADIODIAGNOSIS",
    "RADIO-DIAGNOSIS": "RADIODIAGNOSIS",
    "SURGERY": "GENERAL SURGERY", "GEN SURGERY": "GENERAL SURGERY",
    "DERMATOLOGY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY & VENEREOLOGY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY AND VENEREOLOGY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY, VENEREOLOGY & VENEREOLOGY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY, VENEREOLOGY AND LEPROLOGY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY, VENEREOLOGY & LEPROSY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY, VENEREOLOGY AND LEPROSY": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "DERMATOLOGY, VENEREOLOGY &": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",  # line wrap
    "OBG": "OBSTETRICS & GYNAECOLOGY", "OBGY": "OBSTETRICS & GYNAECOLOGY",
    "OBST. & GYNAE": "OBSTETRICS & GYNAECOLOGY",
    "OBS & GYNAE": "OBSTETRICS & GYNAECOLOGY",
    "OBG (OBSTETRICS & GYNAECOLOGY)": "OBSTETRICS & GYNAECOLOGY",
    "OBSTETRICS AND GYNAECOLOGY": "OBSTETRICS & GYNAECOLOGY",
    "OBSTETRICS & GYN": "OBSTETRICS & GYNAECOLOGY",
    "ENT": "OTORHINOLARYNGOLOGY", "ENT (ENT)": "OTORHINOLARYNGOLOGY",
    "ENT (OTORHINOLARYNGOLOGY)": "OTORHINOLARYNGOLOGY",
    "OTORHINOLARYNGOLOGY (ENT)": "OTORHINOLARYNGOLOGY",
    "E.N.T": "OTORHINOLARYNGOLOGY",
    "ORTHO": "ORTHOPAEDICS", "ORTHO SURGERY": "ORTHOPAEDICS",
    "ORTHOPEDICS": "ORTHOPAEDICS", "ORTHOPAEDIC SURGERY": "ORTHOPAEDICS",
    "ORTHPAEDICS": "ORTHOPAEDICS",
    "PAEDIATRICS": "PAEDIATRICS", "PEDIATRICS": "PAEDIATRICS",
    "PULMONARY MEDICINE": "PULMONARY MEDICINE & CRITICAL CARE",
    "PULMONARY MEDICINE AND CRITICAL CARE": "PULMONARY MEDICINE & CRITICAL CARE",
    "PULMONARY & CRITICAL CARE": "PULMONARY MEDICINE & CRITICAL CARE",
    "CFM": "COMMUNITY & FAMILY MEDICINE", "CMFM": "COMMUNITY & FAMILY MEDICINE",
    "COMMUNITY AND FAMILY MEDICINE": "COMMUNITY & FAMILY MEDICINE",
    "COMMUNITY MEDICINE": "COMMUNITY & FAMILY MEDICINE",
    "COMMUNITY MEDICINE & FAMILY MEDICINE": "COMMUNITY & FAMILY MEDICINE",
    "FAMILY MEDICINE": "COMMUNITY & FAMILY MEDICINE",
    "FMT": "FORENSIC MEDICINE & TOXICOLOGY",
    "FORENSIC MEDICINE": "FORENSIC MEDICINE & TOXICOLOGY",
    "FORENSIC MEDICINE AND TOXICOLOGY": "FORENSIC MEDICINE & TOXICOLOGY",
    "FMT (FMT)": "FORENSIC MEDICINE & TOXICOLOGY",
    "IMMUNO HEMATOLOGY & BLOOD TRANSFUSION": "IMMUNOHAEMATOLOGY & BLOOD TRANSFUSION",
    "IMMUNOHEMATOLOGY & BLOOD TRANSFUSION": "IMMUNOHAEMATOLOGY & BLOOD TRANSFUSION",
    "IMMUNOHAEMATOLOGY AND BLOOD TRANSFUSION": "IMMUNOHAEMATOLOGY & BLOOD TRANSFUSION",
    "IMMUNO HEMATOLOGY & BLOOD": "IMMUNOHAEMATOLOGY & BLOOD TRANSFUSION",  # wrap
    "IMMUNOHAEMATOLOGY AND BLOOD": "IMMUNOHAEMATOLOGY & BLOOD TRANSFUSION",  # wrap
    "TRANSFUSION MEDICINE": "IMMUNOHAEMATOLOGY & BLOOD TRANSFUSION",
    "CARDIO THORACIC AND VASCULAR SURGERY": "CARDIOTHORACIC & VASCULAR SURGERY",
    "CARDIOTHORACIC AND VASCULAR SURGERY": "CARDIOTHORACIC & VASCULAR SURGERY",
    "CARDIOVASCULAR & THORACIC SURGERY": "CARDIOTHORACIC & VASCULAR SURGERY",
    "CARDIOTHORASIC AND VASCULAR SURGERY": "CARDIOTHORACIC & VASCULAR SURGERY",  # typo
    "CARDIOTHORACIC AND VASCULAR": "CARDIOTHORACIC & VASCULAR SURGERY",  # wrap
    "CTVS": "CARDIOTHORACIC & VASCULAR SURGERY",
    "NEURO SURGERY": "NEUROSURGERY", "NEURO SURGERY M.CH": "NEUROSURGERY",
    "BURN & PLASTIC SURGERY": "BURNS & PLASTIC SURGERY",
    "BURNS & PLASTIC SURGERY": "BURNS & PLASTIC SURGERY",
    "HOSPITAL ADMIN": "HOSPITAL ADMINISTRATION",
    "PHARMACOLOGY": "PHARMACOLOGY",
    "PSYCHIATRY": "PSYCHIATRY",
    # PDF line-wrap truncations + official typos (kept explicit, never guessed)
    "DERMATOLOGY, VENEREOLOGY &": "DERMATOLOGY, VENEREOLOGY & LEPROLOGY",
    "TRAUMA SURGRY & CRITICAL CARE": "TRAUMA SURGERY & CRITICAL CARE",  # official typo
    "TRAUMA SURGRY & CRITICAL CARE (MCH": "TRAUMA SURGERY & CRITICAL CARE [DIRECT 6-YEAR]",
    "TRAUMA SURGRY & CRITICAL CARE (MCH 6": "TRAUMA SURGERY & CRITICAL CARE [DIRECT 6-YEAR]",
    "TRAUMA SURGERY & CRITICAL CARE (MCH": "TRAUMA SURGERY & CRITICAL CARE [DIRECT 6-YEAR]",
    "CARDIOTHORACIC AND VASCULAR SURGERY CTVS (MCH 6": "CARDIOTHORACIC & VASCULAR SURGERY [DIRECT 6-YEAR]",
    "TRAUMA AND EMERGENCY MEDICINE": "TRAUMA & EMERGENCY MEDICINE",
    "TRAUMA AND EMERGENCY MEDICINE (MD EMERGENCY": "TRAUMA & EMERGENCY MEDICINE",
}

# parenthetical abbreviations stripped after aliasing (course-type tags that
# just repeat the specialty name)
TAGS_TO_STRIP = [
    "(MDS)", "(ENT)", "(FMT)", "(OBG)", "(PMR)", "(CFM)", "(OPH)", "(CTVS)",
    "(MS)", "(MD)", "(M.CH)", "(MCH)", "(DM)", "(DIRECT 6 YEAR COURSE)",
]

# direct 6-year DM/MCh superspecialties keep their identity via this marker
SIX_YEAR_MARK = re.compile(
    r"\((?:DM|M\.?CH|6)[^)]*6[^)]*\)|\(6 YEAR|DM\(DIRECT|DM \(DIRECT|M\.CH \(DIRECT|6 YEARS\)|6 YRS\)|6 YERARS\)", re.I)

WRAP_TAILS = re.compile(r"[(),.&/]?\s*$")  # names truncated mid-parenthesis


def canon_specialty(raw: str):
    s = re.sub(r"\s+", " ", raw.upper().strip().replace(",", ", "))
    # unify punctuation spacing
    s = re.sub(r"\s*,&\s*", " & ", s)
    s = re.sub(r"\s+", " ", s)
    # wrapped/truncated spellings live in the alias table — resolve them first
    if s in SPECIALTY_ALIASES:
        return SPECIALTY_ALIASES[s]
    six_year = bool(SIX_YEAR_MARK.search(s))
    for tag in TAGS_TO_STRIP:
        s = s.replace(tag, " ")
    s = re.sub(r"\s+", " ", s).strip(" .,()")
    # Parentheticals: either a DIRECT 6-YEAR course marker (contains 6/DM/MCh)
    # or an abbreviation expansion (CFM (Community Medicine & Family Medicine))
    # or a truncated PDF wrap (ends mid-parenthesis).
    if "(" in s:
        inner_all = " ".join(re.findall(r"\(([^)]*)", s))
        stem = s[: s.find("(")].strip(" .,")
        expanded = re.sub(r"\([^)]*\)??", " ", s)
        expanded = re.sub(r"\s+", " ", expanded).strip(" .,")
        if re.search(r"\b(6|YEARS?|YRS?|YERARS|DM|M\.?CH)\b", inner_all) or inner_all.rstrip(")").endswith(("6", "DM", "M.CH", "MCH")):
            resolved = SPECIALTY_ALIASES.get(stem or expanded, stem or expanded)
            if resolved and "6" not in resolved:
                resolved += " [DIRECT 6-YEAR]"
            return resolved
        # expansion (or wrap): resolve by the abbreviation or the expanded text
        for cand in (stem, expanded, s.replace("(", " ").replace(")", " ")):
            cand = re.sub(r"\s+", " ", cand).strip(" .,")
            if not cand:
                continue
            hit = SPECIALTY_ALIASES.get(cand, cand if cand in CANON_KNOWN else None)
            if hit:
                if six_year and "6" not in hit:
                    hit += " [DIRECT 6-YEAR]"
                return hit
        return None
    canon = SPECIALTY_ALIASES.get(s, s)
    if six_year and "6" not in canon:
        canon = canon + " [DIRECT 6-YEAR]"
    return canon


# canonical names produced by the alias table (populated at module load) —
# used to accept already-canonical expanded spellings without listing each
CANON_KNOWN = set(SPECIALTY_ALIASES.values())


def load_jsonl(p: Path):
    return [json.loads(l) for l in p.open(encoding="utf-8")]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def provenance_for(session: str, kind: str):
    kind_aliases = {"result": ("result", "result-oldportal")}
    for e in json.loads(RAWLOG.read_text(encoding="utf-8")):
        if e.get("session") == session and e.get("kind") in kind_aliases.get(kind, (kind,)):
            origin = " (web.archive.org copy of the old portal)" if e["kind"].endswith("oldportal") else ""
            return {"source": "official:AIIMS " + ("result notification" if kind == "result" else "seat allocation round") + origin,
                    "url": e["url"], "sha256": e["sha256"], "downloaded": "2026-09-20"}
    raise KeyError(f"no provenance for {session} {kind}")


def build_distribution(session: str):
    rows = load_jsonl(PARSED / session / "result-mdms.jsonl")
    rows.sort(key=lambda r: r["rank"])
    micro = [[r["rank"], round(r["percentile"] * 1_000_000)] for r in rows]
    year, month = session.split("-")
    snap = {
        "snapshot_id": f"DS-INICET-DISTRIBUTION-{year}{month}-v1",
        "dataset_kind": "rank_percentile_distribution",
        "format": "rank-percentile-v1",
        "format_doc": [
            "rows: [rank, percentile_micros] of QUALIFIED MD/MS candidates, sorted by rank",
            "percentile_micros = official AIIMS percentile x 10^6 (integer, no precision lost)",
            "percentile is NON-INCREASING down the rows (published rounded; ties expected)",
            "rank gaps = appeared-but-not-qualified candidates (not listed by AIIMS)",
            "separation rule: this distribution serves percentile->rank ONLY (INI-CET publishes no marks, ever)",
        ],
        "exam": "INI-CET",
        "session": session,
        "exam_year": int(year),
        "pattern_version": "200 marks (+1/-1/3)",
        "provenance": provenance_for(session, "result"),
        "validation": {
            "rows": len(rows),
            "first_rank": rows[0]["rank"],
            "max_rank": rows[-1]["rank"],
            "rank_gaps": rows[-1]["rank"] - len(rows),
            "unique_ranks": len({r["rank"] for r in rows}) == len(rows),
            "percentile_nonincreasing": all(
                micro[i][1] >= micro[i + 1][1] for i in range(len(micro) - 1)),
            "min_percentile": rows[-1]["percentile"],
            "max_percentile": rows[0]["percentile"],
        },
        "rows": micro,
    }
    assert snap["validation"]["unique_ranks"]
    assert snap["validation"]["percentile_nonincreasing"]
    dest = PD / "distribution" / f"ini-cet-{session}" / "v1" / "rank-percentile.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(snap), encoding="utf-8")
    print(f"distribution {session}: {len(rows)} rows, max_rank {rows[-1]['rank']}, "
          f"gaps {snap['validation']['rank_gaps']}, pct {rows[0]['percentile']}..{rows[-1]['percentile']}")
    return dest


def build_counselling(session: str):
    # final state: 1st -> 2nd -> open, latest roll occurrence wins
    final = {}
    per_round = {}
    for rname in ROUND_ORDER:
        path = PARSED / session / f"round-{rname}.jsonl"
        if not path.exists():
            raise FileNotFoundError(path)
        per_round[rname] = 0
        for r in load_jsonl(path):
            if r.get("section") != "MDMS":
                continue
            final[r["roll"]] = {**r, "round": rname}
            per_round[rname] += 1

    pools = {}
    groups = {}
    unmapped_specialties = set()
    institutes, specialties = [], []
    inst_idx, spec_idx = {}, {}

    for row in final.values():
        pools[row["seat_pool"]] = pools.get(row["seat_pool"], 0) + 1
        if row["seat_pool"] != "GENERAL":
            continue
        if row["seat_category"] not in CATEGORIES:
            continue
        spec = canon_specialty(row["specialty_raw"])
        if spec is None:
            unmapped_specialties.add(row["specialty_raw"])
            continue
        inst = row["institute_raw"]
        if inst not in inst_idx:
            inst_idx[inst] = len(institutes)
            institutes.append(inst)
        if spec not in spec_idx:
            spec_idx[spec] = len(specialties)
            specialties.append(spec)
        key = (inst_idx[inst], spec_idx[spec], row["seat_category"], row["seat_pwd"])
        g = groups.setdefault(key, {"ranks": []})
        g["ranks"].append(row["rank"])

    assert not unmapped_specialties, f"unmapped specialties: {unmapped_specialties}"
    cat_enum = CATEGORIES
    # rows: [inst, spec, pool(0=INI single pool), cat, pwd, closing, opening, count]
    out_rows = []
    for (ii, si, cat, pwd), g in sorted(groups.items()):
        ranks = g["ranks"]
        out_rows.append([ii, si, 0, cat_enum.index(cat), 1 if pwd else 0,
                         max(ranks), min(ranks), len(ranks)])
    out_rows.sort(key=lambda r: (r[0], r[1], r[3], r[4]))

    year, month = session.split("-")
    snap = {
        "snapshot_id": f"DS-INICET-COUNSELLING-{year}{month}-v1",
        "dataset_kind": "counselling_closing_ranks_FINAL_STATE",
        "format": "indexed-v1",
        "format_doc": [
            "rows: [institute_idx, specialty_idx, pool_idx, category_idx, pwd, closing_rank, opening_rank, allotted_count]",
            "FINAL-STATE semantics: one record per candidate as of the end of online counselling (1st -> 2nd -> open; latest round wins by roll; mock rounds are indicative and excluded)",
            "quota_enum has a single value INI: INI-CET is ONE counselling pool (spec 3.6)",
            "seat_category is the cutoff dimension (an OBC candidate may hold a UR seat — same decision as NEET PG allotted_category)",
            "MD/MS/DM(6yr)/MCh(6yr) courses only — MDS is a separate rank space and pool",
            "sponsored / foreign-national / institute / OCS / domicile-preference seats are EXCLUDED from rows (separate pools) but counted in load_stats",
            "closing = max AIR, opening = min AIR per (institute x specialty x seat-category x pwd) over the final state",
        ],
        "exam": "INI-CET",
        "session": session,
        "exam_year": int(year),
        "counselling": "AIIMS INI-CET online seat allocation (all INIs)",
        "pattern_version": "200 marks (+1/-1/3)",
        "provenance": {
            "source": "official:AIIMS INI-CET seat allocation results, rounds 1st/2nd/open",
            "files": [f"round-{r}.pdf" for r in ROUND_ORDER],
            "url": "https://docs.aiimsexams.ac.in/sites/ (see data/raw/aiims/PROVENANCE.txt)",
            "downloaded": "2026-09-20",
        },
        "dictionaries": ["category-v1", "inicet-specialty-v1"],
        "quota_enum": ["INI"],  # indexed-v1 contract field (single INI pool)
        "category_enum": cat_enum,
        "load_stats": {
            "final_rows": len(final),
            "rows_from": per_round,
            "seats_by_pool": pools,
            "groups": len(out_rows),
            "quarantined": 0,
        },
        "notes": [
            "round label = final state (end of online counselling)",
            "raw values preserved in the parsed layer (data/parsed/aiims)",
        ],
        "institutes": institutes,
        "courses": specialties,  # indexed-v1 field name (same contract as NEET PG)
        "rows": out_rows,
    }
    # invariants
    assert all(len(r) == 8 for r in out_rows)
    assert all(r[5] >= r[6] and r[7] >= 1 for r in out_rows)
    assert all(0 <= r[0] < len(institutes) and 0 <= r[1] < len(specialties) for r in out_rows)
    dest = PD / "counselling" / f"ini-cet-{session}" / "v1" / "closing-ranks.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(snap), encoding="utf-8")
    print(f"counselling {session}: {len(out_rows)} groups over {len(final)} final candidates "
          f"({pools.get('GENERAL', 0)} general-pool) | institutes {len(institutes)} specialties {len(specialties)}")
    return dest


def update_manifest(new_files):
    man_path = PD / "MANIFEST.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    for session, kind, dest in new_files:
        rel = str(dest.relative_to(PD)).replace("\\", "/")
        data = json.loads(dest.read_text(encoding="utf-8"))
        entry = {
            "id": data["snapshot_id"],
            "file": rel,
            "kind": data["dataset_kind"],
            "session": session,
        }
        if kind == "distribution":
            entry["rows"] = data["validation"]["rows"]
        else:
            entry["groups"] = len(data["rows"])
            entry["final_rows"] = data["load_stats"]["final_rows"]
        man["snapshots"] = [e for e in man["snapshots"] if e.get("id") != entry["id"]]
        man["snapshots"].append(entry)
        man["file_hashes"][rel] = sha256_file(dest)
    man["snapshots"].sort(key=lambda e: e["id"])
    man["file_hashes"] = dict(sorted(man["file_hashes"].items()))
    man_path.write_text(json.dumps(man, indent=1), encoding="utf-8")
    print(f"MANIFEST updated: {len(man['snapshots'])} snapshots")


def main():
    new = []
    for s in DIST_SESSIONS:
        new.append((s, "distribution", build_distribution(s)))
    for s in COUNS_SESSIONS:
        new.append((s, "counselling", build_counselling(s)))
    update_manifest(new)
    print(f"built {len(new)} snapshots at {time.strftime('%Y-%m-%d %H:%M')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
