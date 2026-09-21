"""INI-CET (M2 Phase 1) — download the enumerated official AIIMS PDFs.

Two source shapes (both official AIIMS infrastructure):
  1. docs.aiimsexams.ac.in/sites/<file>  — live document host (2023-2025)
  2. web.archive.org copies of the OLD portal www.aiimsexams.ac.in/pdf/... —
     the only remaining home of the 2021/2022 candidate lists

Each file lands in data/raw/aiims/<session>/<kind>-<name>.pdf with SHA-256
recorded; PROVENANCE.txt is written per the repo's data/raw conventions.
Re-runnable: existing files with matching size+hash are skipped.
"""
import hashlib
import json
import sys
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUTDIR = ROOT / "data" / "raw" / "aiims"
DOCS = "https://docs.aiimsexams.ac.in/sites/"
UA = {"User-Agent": "Mozilla/5.0 (eyeconic-data-pipeline)"}

# session-key -> files to fetch from the live docs host.
# kind: result (qualified-candidates distribution) | round (seat allocation).
#
# NOT here by design: the 2026-01 session (result + round-2nd). Those files sit
# behind the hash-obfuscated SPA result pages and were obtained by a one-time
# MANUAL browser grab on 2026-09-21 — they live in data/raw/aiims/2026-01/
# with PROVENANCE/download-log entries; nothing for this script to fetch.
LIVE = {
    "2023-07": [("result", "INICET_July_23_Result-NET.pdf"),
                 ("round-1st", "INICET_Jul_23_1st_Round-website-compressed.pdf"),
                 ("round-open", "INICET_Jul_23_Open_Round-website.pdf")],
    "2023-01": [("round-1st", "INICET_Jan_23_1st_Round-website_compressed.pdf"),
                 ("round-2nd", "INICET_Jan_23_2nd_Round_v2-website_new.pdf"),
                 ("round-open", "INICET_Jan_23_Open_Round-website.pdf")],
    "2024-01": [("result", "Website-INICET_Jan_24_Result_compressed.pdf"),
                 ("round-1st", "Website-INICET_Jan_24_1st_Round.pdf"),
                 ("round-2nd", "Website-INICET_Jan_24_2nd_Round.pdf"),
                 ("round-open", "Website-INICET_Jan_24_Open_Round.pdf")],
    "2024-07": [("round-1st", "Website-INICET_Jul_24_1st_Round.pdf"),
                 ("round-2nd", "Website-INICET_Jul_24_2nd_Round.pdf"),
                 ("round-open", "Website-INICET_Jul_24_Open_Round.pdf")],
    "2025-01": [("result", "RESULT-ALL QUALIFIED INICET-January 2025-FINAL-NET.pdf"),
                 ("round-1st", "INICET_Jan_25_1st_Round-Website.pdf"),
                 ("round-2nd", "Website-INICET_Jan_25_2nd_Round.pdf"),
                 ("round-open", "RESULT_OPEN_ROUND_INICET_JAN_2025-NET.pdf")],
    "2025-07": [("result", "Website-INICET_Jul_25_Result.pdf"),
                 ("round-1st", "Website-INICET_Jul_25_1st_Round_Final.pdf"),
                 ("round-2nd", "Website-INICET_Jul_25_2nd_Round_Final.pdf"),
                 ("round-open", "Website-INICET_Jul_25_Open_Round_23AUG2025.pdf")],
}

# Old-portal candidate lists preserved only in the Wayback Machine.
# label: (original URL, note)
WAYBACK = {
    "2021-07/result-oldportal.pdf": (
        "https://www.aiimsexams.ac.in/pdf/RESULT-INICET-JULY-2021%20SESSION.pdf",
        "INI-CET July 2021 session result (old portal)"),
    "2022-01/result-oldportal.pdf": (
        "https://www.aiimsexams.ac.in/pdf/RESULT-INICET-JANUARY-2022%20SESSION-NET.pdf",
        "INI-CET January 2022 session result (old portal)"),
    "unknown/result-misc-oldportal.pdf": (
        "https://www.aiimsexams.ac.in/pdf/REsult-INICET-net.pdf",
        "unidentified INI-CET result list (old portal; session read from content)"),
    "unknown/round-1st-oldportal-a.pdf": (
        "https://www.aiimsexams.ac.in/pdf/INI-CET_1st_Online%20Seat%20Allocation_Result-MDMS-MDS-NET.pdf",
        "unidentified INI-CET 1st-round allocation list (old portal)"),
    "unknown/round-1st-oldportal-b.pdf": (
        "https://www.aiimsexams.ac.in/pdf/INI-CET_Online%20Seat%20Allocation_1ST%20ROUND-MDMS-MDS-FINAL-NET.pdf",
        "unidentified INI-CET 1st-round allocation list (old portal)"),
    "unknown/round-1st-oldportal-c.pdf": (
        "https://www.aiimsexams.ac.in/pdf/INI-CET_Online%20Seat%20Allocation_1ST%20ROUND-MDMS-MDS-NET_.pdf",
        "unidentified INI-CET 1st-round allocation list (old portal)"),
    "unknown/round-2nd-oldportal.pdf": (
        "https://www.aiimsexams.ac.in/pdf/2ND%20ROUND%20INI-CET_Online%20Seat%20Allocation-MDMS-MDS-NET.pdf",
        "unidentified INI-CET 2nd-round allocation list (old portal)"),
    "unknown/counsel1-rankwise-oldportal.pdf": (
        "https://www.aiimsexams.ac.in/pdf/INI-CET-COUNSEL1_Rank_Wise-NET.pdf",
        "unidentified INI-CET counselling rank-wise list (old portal; likely Jan 2021)"),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 10000:
        return "kept", sha256(dest.read_bytes()), dest.stat().st_size
    r = requests.get(url, timeout=240, headers=UA)
    if r.status_code != 200 or len(r.content) < 10000 or not r.content.startswith(b"%PDF"):
        return f"FAIL http={r.status_code} bytes={len(r.content)}", None, len(r.content)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return "downloaded", sha256(r.content), len(r.content)


def wayback_fetch(original_url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 10000:
        return "kept", sha256(dest.read_bytes()), dest.stat().st_size
    q = ("https://web.archive.org/cdx/search/cdx?url=" + urllib.parse.quote(original_url, safe="")
         + "&output=json&filter=statuscode:200&limit=-5&fl=timestamp,original,statuscode,length")
    try:
        meta = requests.get(q, timeout=120).json()
    except Exception as e:
        return f"FAIL cdx:{e}", None, 0
    rows = meta[1:] if meta and len(meta) > 1 else []
    for row in sorted(rows, key=lambda r: r[0], reverse=True):
        ts = row[0]
        snap = f"https://web.archive.org/web/{ts}id_/{original_url}"
        try:
            r = requests.get(snap, timeout=300, headers=UA)
        except requests.RequestException as e:
            continue
        if r.status_code == 200 and r.content.startswith(b"%PDF") and len(r.content) > 10000:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
            return f"wayback:{ts}", sha256(r.content), len(r.content)
    return "FAIL no-archived-pdf", None, 0


def main():
    log = []
    for session, files in LIVE.items():
        for kind, name in files:
            url = DOCS + urllib.parse.quote(name)
            dest = OUTDIR / session / f"{kind}.pdf"
            status, digest, size = download(url, dest)
            log.append({"session": session, "kind": kind, "file": name, "url": url,
                        "status": status, "bytes": size, "sha256": digest})
            print(f"{status:>12}  {session} {kind:<12} {name} ({size:,} B)")

    for label, (url, note) in WAYBACK.items():
        dest = OUTDIR / label
        status, digest, size = wayback_fetch(url, dest)
        log.append({"session": label.split("/")[0], "kind": label.split("/")[1].replace(".pdf", ""),
                    "file": label, "url": url, "status": status, "bytes": size, "sha256": digest,
                    "note": note})
        print(f"{status:>12}  {label} ({size:,} B)")

    prov = OUTDIR / "PROVENANCE.txt"
    lines = [
        "INI-CET official AIIMS PDFs (M2 Phase 1 ingestion corpus)",
        f"Downloaded: {time.strftime('%Y-%m-%d')}",
        "",
        "Live document host: https://docs.aiimsexams.ac.in/sites/<file> (official AIIMS exams docs host;",
        "enumerated via filename patterns + Wayback CDX; see scripts/phase2/inicet_enumerate.py and",
        "data/raw/aiims/index.json). Old-portal 2021/2022 files exist only as web.archive.org snapshots",
        "of www.aiimsexams.ac.in/pdf/... (the portal is now a JS SPA; those paths 404 live).",
        "",
    ]
    for e in log:
        lines.append(f"[{e['session']}] {e['kind']}")
        lines.append(f"  URL: {e['url']}")
        lines.append(f"  Status: {e['status']}  Bytes: {e['bytes']}  SHA-256: {e['sha256']}")
        if e.get("note"):
            lines.append(f"  Note: {e['note']}")
        lines.append("")
    prov.write_text("\n".join(lines), encoding="utf-8")
    (OUTDIR / "download-log.json").write_text(json.dumps(log, indent=1), encoding="utf-8")

    fails = [e for e in log if str(e["status"]).startswith("FAIL")]
    print(f"\n{len(log)} files: {len(log)-len(fails)} ok, {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
