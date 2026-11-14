# INI-CET Jul-2026 Session Backfill (Phase E) — 2026-11-15

One-line scope: ingest the official **INI-CET July 2026 session** (result +
complete 1st/2nd/open round set) as the 9th `rank-percentile` distribution and
the 7th final-state counselling snapshot. The runtime **anchor pair is
untouched** (prior `PR-INICET-CORRECTS-AIR-202701-v1` × distribution
`DS-INICET-DISTRIBUTION-202701-v1`); only branch-matching coverage extends and
the readiness trailing-4 window slides by design.

## Source (all manual browser grabs, operator-provided)

| file | notification | dated | pages |
|---|---|---|---|
| result.pdf | 175/2026 (CBT 16-05-2026) | 23-05-2026 | 1,324 |
| round-1st.pdf | 205/2026 | 24-06-2026 | 808 |
| round-2nd.pdf | 216/2026 | 10-07-2026 | 177 |
| round-open.pdf | 261/2026 | 21-08-2026 | 33 |

Raw files at `data/raw/aiims/2026-07/` (gitignored by design); SHA-256s +
notes in `PROVENANCE.txt` + `download-log.json`.

## Three layout novelties (all in the parser, all proven non-regressive)

1. **Gap-free rank space.** The result list is fully contiguous: 48,437 MD/MS
   rows = max rank 48,437, **zero withheld ranks** (every prior session has
   1.2–2.4k gaps). Verified independently: page-1 anchors reproduce exactly
   (rank 1858 → 98.0221518, rank 44157 → 52.3820877), rank 48,437 is a real
   PDF row (roll 8057274, bottom-tie 45.2943471), categories sum exactly
   (UR 23,360 · OBC 15,996 · SC 4,202 · EWS 3,748 · ST 1,131).
2. **Literal foreign/sponsored seat tokens.** Prior sessions print `IP-n` or
   nothing; Jul-2026 prints `Sponsored`, `Foreign National`, `Bhutani
   National` (title case). `SEAT_RE` now matches these families
   case-insensitively (family uppercased; annotations stay raw — the
   RESTRICTED pool routes on mixed-case "Preference"/"Domicile").
3. **`1.3 Foreign/Sponsored MDMS Courses` + `1.4 Foreign/Sponsored MDS
   Course` sections** printed AFTER the MDS section. The section state machine
   now re-sets the section on these headers.

All 59 historical parse files stayed **byte-identical** through changes 2's
regex work (SHA-256 before/after); change 3 deliberately re-tags historical
foreign/sponsored rows MDS→MDMS (see below).

## Historical data-layer correction (load_stats only)

The 1.3 foreign/sponsored sections have existed in the historical round PDFs
all along (e.g. 2023-01 line 54,275) — those rows were silently mis-sectioned
as MDS since M2 Phase 1, invisible because they carry non-general pools and
never entered snapshot rows. With the section fix they are counted truthfully:

- **Closing-rank rows, institutes, courses, category enums: byte-identical to
  HEAD for all six historical counselling snapshots (proven by key-wise
  diff) — the engine's inputs did not change.**
- Only `load_stats` grew (final_rows / rows_from / seats_by_pool now include
  the sponsored/foreign pools): 2023-01 2090→2171, 2024-01 2201→2269,
  2024-07 2246→2333, 2025-01 2311→2414, 2025-07 2286→2375,
  2026-01 2618→2740. GENERAL pool counts are unchanged everywhere.
- No runtime code reads `load_stats` (metadata only; sole test consumer is a
  `> 1500` lower bound).

## New snapshots

- `distribution/ini-cet-2026-07/v1` (`DS-INICET-DISTRIBUTION-202607-v1`):
  48,437 rows, gaps 0, pct 100.0..45.2943471. MDS parsed-only (3,126 rows).
- `counselling/ini-cet-2026-07/v1` (`DS-INICET-COUNSELLING-202607-v1`):
  1,034 groups over 2,544 final-state candidates (2,043 general-pool; pools
  SPONSORED 419 / OCS 102 / INSTITUTE 41 / FOREIGN 48), 23 institutes,
  58 specialties. Official page-1 anchors: rank 1 (SC candidate) held AIIMS
  ND Medicine seat UR-1; ranks 2/3 = AIIMS ND Medicine UR-2/UR-3.
- Goldens: `s2026_07`, `counselling_2026_07`, `anchors_2026_07` (AIIMS ND
  GenMed UR closing 3 / opening 1 / 3 seats; RadDiagnosis UR closing 4;
  JIPMER GenMed UR 13..54) + corrected `counselling_2026_01` /
  `counselling_2025_07` pins with notes. MANIFEST: 21 snapshots.

## Config + readiness window slide (the designed auto-refresh)

`EXAMS.INI_CET.counselling` += 2026-07. The readiness trailing-4 window slid
from [2024-07, 2025-01, 2025-07, 2026-01] to [2025-01, 2025-07, 2026-01,
2026-07] (config-driven, `readiness-anchors-v1` definitions unchanged — no
rule-id bump; per Phase C precedent old readiness records re-derive with the
standard `verified:false` diff annotation):

- **ANY_SEAT unchanged: 44,418** (2025-07). Jul-2026's deepest UR close is
  37,704 — above the floor, so the conservative 110c stands.
- **STRONG tightened 4 → 3**: Jul-2026 AIIMS ND GenMed UR closed at AIR 3
  (page-1 rank 1 held the seat) — better than the v2 ladder's best rung
  (AIR 4 at 169.88c), so STRONG is open-ended again: `requiredCorrects:
  null, above-ladder, ladderEndCorrects: 169.88` with the honest
  "ladder cannot resolve how many" note. Context-only; default target math
  untouched.
- DBP GenMed UR span [4, 2910] → **[3, 2910]** (tight end moved to Jul-2026;
  loose end 2910 @ Jan-2026 unchanged); INI branch catalog 105 → **109**
  course keys.

## Verification trail (all green at HEAD)

1. Historical parses byte-identical through the seat-token change (59/59
   SHA-256); section fix re-tags only (rows/values identical).
2. Historical counselling snapshots: rows/institutes/courses/enums identical
   to HEAD; only load_stats changed (key-wise proof).
3. `validate_snapshots.py`: all substantive checks pass (7 pre-commit blob
   failures are the by-design uncommitted-blob check; ALL PASS post-commit).
4. Full server suite **578/578** (32 suites).
5. `verify_inicet_allotment_recall.js`: **175/175** (25/session × 7 sessions).
6. `inicet_consistency_report.js`: PASS (anchor 2027-01 untouched).
7. `verify_round_trip.js`: **6,824 INI closings, 0 violations** — repaired in
   this phase: still called `loadIniCetPrior()` bare (Phase C leftover) and
   pinned the v1 Hazra ceiling (corrects ≤ 160); now config-driven prior file
   + model-span bounds with the D5 ceil.
8. Readiness edge census: **61/61** — row 18.5.b re-pinned (ladder end 160 →
   169.88; stale since Phase C, scenario live again now that STRONG is
   above-ladder).
9. Client: no changes, no hardcoded session text (coverage chips derive from
   dataCoverage). No client build needed.

## Explicitly NOT in this phase

- No prior change (v2 stays), no distribution anchor change (2027-01 stays),
  no method-version bumps (forward `inicet-branch-p7-v1` /
  `desired-inicet-v2` / `readiness-inicet-v2` all unchanged — the anchor
  VALUE drift is the accepted config-window semantics).
- Phase F: Jan-2027 counselling ingest (~Feb–Mar 2027 reminder).
- Phase G honesty report; calibration (gates 30/100 pairs).
- Any deploy — user deploys; Vercel env check first, then
  `server/scripts/verify_prod_inicet_predictor.js` smoke. Phases C+D+E all
  ride the next server deploy together.
