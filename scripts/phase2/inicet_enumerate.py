"""INI-CET (M2 Phase 1) — enumerate official AIIMS PDFs on docs.aiimsexams.ac.in.

Verified URL shape (research 2026-09-18 + live probe 2026-09-20):
  https://docs.aiimsexams.ac.in/sites/<FILENAME>          (direct, HTTP 200)

The portal is a JS SPA, so filenames are enumerated two ways:
  1. Wayback CDX (prefix sweep of /sites/, filtered locally for INICET)
  2. HEAD-probing filename patterns observed in verified URLs, for every
     session (Jan/Jul 2021-2026) x round kind (mock/1st/2nd/3rd/open/spot)

Output: data/raw/aiims/index.json  ({url, bytes, last_modified, found_by})
Read-only except that file. Re-runnable; merges nothing (latest run wins).
"""
import json
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "raw" / "aiims" / "index.json"
BASE = "https://docs.aiimsexams.ac.in/sites/"

SESSIONS = [
    (mon, month, yy, yyyy)
    for yyyy, mon, month in (
        (2021, "Jan", "January"), (2021, "Jul", "July"),
        (2022, "Jan", "January"), (2022, "Jul", "July"),
        (2023, "Jan", "January"), (2023, "Jul", "July"),
        (2024, "Jan", "January"), (2024, "Jul", "July"),
        (2025, "Jan", "January"), (2025, "Jul", "July"),
        (2026, "Jan", "January"), (2026, "Jul", "July"),
    )
    for yy in (str(yyyy)[2:],)
]
ROUNDS = ["Mock", "1st", "2nd", "3rd", "Open", "Spot"]


def result_variants(mon, month, yy, yyyy):
    return [
        f"Website-INICET_{mon}_{yy}_Result.pdf",
        f"Website-INICET_{mon}_{yyyy}_Result.pdf",
        f"RESULT-ALL QUALIFIED INICET-{month} {yyyy}-FINAL-NET.pdf",
        f"INICET_{month}_{yy}_Result-NET.pdf",
        f"INICET_{mon}_{yy}_Result-NET.pdf",
        f"INICET-{month}-{yyyy}-Result-NET.pdf",
        f"INICET {month} {yyyy} Result.pdf",
    ]


def round_variants(mon, month, yy, yyyy, rnd):
    return [
        f"INICET_{mon}_{yy}_{rnd}_Round-Website.pdf",
        f"Website-INICET_{mon}_{yy}_{rnd}_Round.pdf",
        f"Website-INICET_{mon}_{yy}_{rnd}_Round_Final.pdf",
        f"Website-INICET_{mon}_{yy}_{rnd}_Round_final.pdf",
        f"INICET_{mon}_{yy}_{rnd}_Round.pdf",
        f"RESULT_{rnd.upper()}_ROUND_INICET_{mon.upper()}_{yyyy}-NET.pdf",
        f"RESULT {rnd.upper()} ROUND INICET {mon.upper()} {yyyy}.pdf",
        f"INICET_{mon}_{yy}_{rnd}_Round-NET.pdf",
    ]


def probe(name):
    url = BASE + urllib.parse.quote(name)
    try:
        r = requests.head(url, timeout=25, allow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0 (eyeconic-data-pipeline)"})
        if r.status_code == 200:
            return {
                "file": name,
                "url": url,
                "bytes": int(r.headers.get("Content-Length") or 0),
                "last_modified": r.headers.get("Last-Modified"),
                "found_by": "pattern-probe",
            }
    except requests.RequestException:
        pass
    return None


def wayback_cdx():
    """Prefix sweep; tolerate failure (CDX is slow/unstable from some networks)."""
    hits = []
    for flt in ("", "&filter=statuscode:200"):
        url = ("https://web.archive.org/cdx/search/cdx?url=docs.aiimsexams.ac.in/sites/"
               "&matchType=prefix&collapse=urlkey&fl=original,statuscode&limit=30000" + flt)
        try:
            r = requests.get(url, timeout=120)
            if r.status_code != 200 or not r.text.strip():
                continue
            for line in r.text.splitlines():
                parts = line.split(" ")
                if len(parts) < 2 or parts[1] != "200":
                    continue
                orig = parts[0]
                if "inicet" in orig.lower():
                    hits.append(orig)
            if hits:
                break
        except requests.RequestException:
            continue
    return sorted(set(hits))


def main():
    candidates = []
    for mon, month, yy, yyyy in SESSIONS:
        candidates += result_variants(mon, month, yy, yyyy)
        for rnd in ROUNDS:
            candidates += round_variants(mon, month, yy, yyyy, rnd)
    # Known-verified names from the research/live search (kept explicitly so a
    # pattern change can never lose an already-verified file).
    candidates += [
        "Website-INICET_Jul_25_Result.pdf",
        "RESULT-ALL QUALIFIED INICET-January 2025-FINAL-NET.pdf",
        "Website-INICET_Jul_25_1st_Round_Final.pdf",
        "Website-INICET_Jul_25_2nd_Round_final.pdf",
        "INICET_Jul_25_Mock_Round-Website.pdf",
        "Website-INICET_Jul_25_Open_Round_23AUG2025.pdf",
        "INICET_Jan_25_1st_Round-Website.pdf",
        "Website-INICET_Jan_25_2nd_Round.pdf",
        "RESULT_OPEN_ROUND_INICET_JAN_2025-NET.pdf",
        "INICET_July_23_Result-NET.pdf",
    ]
    candidates = list(dict.fromkeys(candidates))
    print(f"probing {len(candidates)} candidate filenames on {BASE} ...")
    found = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        for res in ex.map(probe, candidates):
            if res:
                found.append(res)
                print(f"  200  {res['bytes']:>12,}  {res['file']}")
    print(f"pattern probe: {len(found)} files")

    wb = wayback_cdx()
    wb_new = []
    for orig in wb:
        name = orig.split("/sites/", 1)[1] if "/sites/" in orig else None
        if not name or any(f["file"] == name for f in found):
            continue
        url = BASE + urllib.parse.quote(name)
        hit = probe(name)
        if hit:
            hit["found_by"] = "wayback-cdx"
            wb_new.append(hit)
            print(f"  200  (CDX) {name}")
    found += wb_new
    print(f"wayback cdx: +{len(wb_new)} additional live files")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": time.strftime("%Y-%m-%d"),
        "host": "docs.aiimsexams.ac.in",
        "probed": len(candidates),
        "files": sorted(found, key=lambda f: f["file"]),
    }, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(found)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
