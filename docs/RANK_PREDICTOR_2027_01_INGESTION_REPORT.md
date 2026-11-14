# INI-CET 2027-01 Result Distribution Ingestion (Phase A) — 2026-11-14

One-line scope: ingest the official **INI-CET January 2027 session** result PDF
(exam held 01-11-2026, Result Notification No. 304/2026 dated 06-11-2026) as the
8th INI-CET `rank-percentile` distribution snapshot. **No engine/config/UI
change** — the runtime anchor stays `2025-07` by design; this phase only grows
the store. The anchor swap is Phase C (ladder v2), executed separately.

## Source

- File: `data/raw/aiims/2027-01/result.pdf` (operator-provided manual grab from
  the SPA result page; 880 pages; SHA-256 `8abf24f5…ad2869`; see
  `data/raw/aiims/PROVENANCE.txt` + `download-log.json`).
- Contents: roll-number-wise list of provisionally qualified candidates —
  Roll No., Category, Applied Under, PWBD, Rank, Percentile. MD/MS/DM(6yr)/
  MCh(6yr) section + a separate MDS section (own rank space from 1 — excluded
  from the snapshot, parsed for traceability as always).

## LAYOUT CHANGE (the one real novelty)

This session publishes **no S.No column** — rows start at the roll number
(every prior session printed S.No first). `inicet_parse.py`'s result-row regex
now makes the sno group **optional**:

- Historical sessions always carry S.No → identical captures (proven: all 14
  historical `result-md{ms,s}.jsonl` files **byte-identical** before/after,
  SHA-256 compared).
- The sno-less shape cannot mis-split against the roll group: the split
  requires whitespace and rolls (6–10 digits) contain none.
- The bad-line detector gained a scoped sno-less shape
  (`^\d{6,10}\s+[A-Za-z*./-]`) so future layout drift fails loudly, not
  silently. 2027-01 parse: **0 unparsed lines**.

## Parsed + snapshot stats (in family with siblings)

| section | rows | max_rank | rank_gaps | min percentile |
|---|---|---|---|---|
| MD/MS (committed) | 32,495 | 33,862 | 1,367 | 45.4152516 |
| MDS (parsed only) | 1,741 | 1,828 | 87 | 45.4435361 |

Categories sum exactly: UR 14,612 · OBC 11,119 · SC 3,215 · EWS 2,713 · ST 836.
Rank 1 present, ranks unique, percentile non-increasing (parser asserts), 62
PWBD rows. Percentiles publish 7 decimals → the existing beyond-micro doc note
applies (rounding the 7th decimal, ≤1e-7 percentile).

## Store changes

- NEW `server/predictor-data/distribution/ini-cet-2027-01/v1/rank-percentile.json`
  (`DS-INICET-DISTRIBUTION-202701-v1`, provenance from download-log).
- `goldens.json`: 2027-01 added to `inicet.distributions.sessions` + pin block
  `s2027_01` (counts + **official page-1 anchors**: rank 322 → 99.4865211,
  rank 23698 → 61.5573357, micros 99486521 / 61557336).
- `MANIFEST.json`: +1 snapshot entry (18 total), +1 file hash, goldens hash
  re-synced by the builder. Semantic diff vs HEAD verified: **no other entry
  or hash changed**.
- `validate_snapshots.py`: pin block for 2027-01 (counts + page-1 anchors).

## Verification trail (all green)

1. Historical parses byte-identical (14/14 files, SHA-256).
2. `validate_snapshots.py`: ALL CHECKS PASSED (post-commit; the pre-commit run
   showed only the expected uncommitted-blob WARN/FAIL for the new+goldens
   files — the check compares against HEAD by design).
3. Full server suite **573/573** (32 suites) after two intentional test
   updates, see below.
4. `scripts/phase5/inicet_consistency_report.js`: PASS, output unchanged
   (it reads the config anchor 2025-07 — untouched in this phase).

## Test changes (both intentional, explained)

1. `tests/predictor/store.test.js` — inventory pin updated: **14 INI-CET**
   files (was 13); belongs to this data change.
2. `tests/predictorReadinessApi.test.js` — **pre-existing time-bomb, unrelated
   to this phase**, fixed in its own commit first: the "NEET PG 2028" test
   re-used a cookie minted at frozen 2026-10-01 (7-day expiry → dead at the
   real clock since **2026-10-08**), so the GET 401'd on every run after that
   date. Verified failing at clean HEAD before any of my changes. The GET now
   authenticates the same user with a fresh real-clock cookie (the check is
   about persisted-targetYear re-derivation, not cookie reuse).

## Explicitly NOT in this phase

- Anchor/prior swap (Phase C — needs ladder v2 from the fresh crowd reports).
- 2026-07 distribution + counselling backfill (Phase E).
- 2027-01 counselling (rounds not yet held; expected complete ~Feb–Mar 2027 —
  Phase F reminder).
- Any deploy: this commit is data + pipeline + tests only; the engine loads
  the new file only when a future phase points config at it.
