# Rank & Branch Predictor — Phase 3 Report (Prediction Engine Foundation)

| | |
|---|---|
| **Status** | Phase 3 COMPLETE (2026-09-20) — engine foundation built; 97 new unit tests green; full server suite 126/126; Phase 2 validator still 30/30 |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §18 Phase 3 (build items: strategy interface, §3.5–3.6 validation, §3.3 aggregation + dedup, §5.4 tier ladder + threshold, dispersion-aware width inputs) |
| **Scope discipline** | No API exposure, no frontend, no ML, no persistence (all Phase 7+). No Eyeconic app code touched. No snapshot data changed (`MANIFEST.json` hashes intact). Engine is unmounted — nothing serves predictions yet. |
| **Code** | `server/predictor/` (12 modules) + `server/tests/predictor/` (8 suites) + `scripts/phase3/calibration_report.js` |

## 1. What was implemented

### 1.1 Exam-strategy interface (spec §18 Phase 3, §9)

Registry pattern: `EXAMS` config + per-exam strategy module behind one contract —
`validate → aggregate → estimatePercentileRange → resolveRankRange (Phase 4) → resolveBranches (Phase 6)`.

- **NEET PG strategy live** for the first three steps.
- **INI-CET strategy scaffolded**: registered (id, label, pattern `200 Qs +1/−⅓`), every step throws a typed error naming Phase 5/M2. Nothing half-built can be served.
- `resolveRankRange` / `resolveBranches` exist on the NEET PG strategy but throw `STEP_NOT_IMPLEMENTED (Phase 4 / Phase 6)` — the interface is real, the phases are not skipped silently.

### 1.2 GT input validation (§3.5–3.6) — `validation.js`

- No minimum beyond ≥ 1 GT, **no maximum** (config `INPUT_RULES`, per §3.1).
- Integer, ≥ 0, ≤ pattern total (200); **out-of-bounds values are rejected, never clamped**; field paths in errors (`gts[2].attempts[0].corrects`) for the Phase 7 API.
- Full-length rule (§3.4 A2): explicit `totalQuestions` must equal the pattern's 200.
- Provenance tagging required per GT (§6A): `auto-captured` (must carry `gtId`) vs `self-reported`.
- A GT with zero completed attempts is rejected, never silently dropped (it would change n).
- **Category**: enum-validated when present, **never defaulted**; `validateForBranches()` is the §3.6 gate Phase 6 will call. PwD carried as a boolean alongside.
- **Quota**: MVP AIQ-only — absent quota is echoed as AIQ *explicitly* (`quotaDefaulted: true`); any other quota is rejected with the "All India Quota only" message.
- `skippedCount` accepted per attempt (the Phase 1 audit showed auto-captured GTs know it exactly).

### 1.3 Aggregation + dedup (§3.3) — `aggregation.js`

- **Dedup rule `one-per-gt-v1`** (Phase 1 audit G3): completed statuses only → prefer approved-and-used retest → latest `endedAt` (null = oldest, array order breaks ties). Every excluded attempt is listed with a machine-readable reason.
- **Mean is the aggregate** (confirmed product rule). **Median and trimmed mean are computed and reported on every prediction** as the required robust-alternatives evaluation:
  - *Evaluation against inspected data*: the only inspected GT dataset is **empty** (Phase 1 audit: 0 grand quizzes, 0 attempts, 2026-09-19), so there is no empirical basis to overturn the confirmed mean. Decision: keep mean; alternatives stay one config line away; revisit at Phase 11 with real retest data. The dedup rule already removes the largest anomaly source (stale attempts).
- Dispersion stats (sample SD, min/max/range) feed the width model; individual values always carried in the result (§3.3 display requirement).

### 1.4 Tier ladder + Percentile-Transfer Prior (§5, §5.4) — `transfer.js`

- **Tier 1 — fraction-correct parity** (launch mode, the only reachable tier today): corrects → exam score under the pattern's marking **assuming all questions attempted**: score = 5c − 200 on the 800-scale (equivalently 1000f − 200). This uses exactly the two stated assumptions (§3.4 A1 no-skip, A3 parity) — no other free parameter.
- **Tier 2 — GT-cohort percentile transfer**: engine-computed mid-rank percentile `(below + 0.5·ties)/size` (definition pinned centrally in config — callers cannot redefine it) → official rank via the pinned formula → score via the distribution's inverse lookup. Falls back to Tier 1 (reason recorded) when the cohort is missing, below threshold, or inverts outside the recorded distribution.
- **Threshold `TIER2_MIN_COHORT = 100` (provisional, configurable)**: the spec's only quantitative anchor is "40 attempts do not make a percentile" (§5.4); 100 sits comfortably above it (±5pp binomial noise at n=100 before transfer error). With zero GT attempts, any threshold keeps Tier 1 at launch — the value only matters as cohorts grow.
- Mixed-tier predictions are supported, flagged (`MIXED_TRANSFER_TIERS`), and recorded per GT (§5.4).
- **All-Tier-1 identity property (tested)**: aggregating in transferred-score space is *exactly* the confirmed §3.3 mean-of-corrects — mean(5cᵢ−200) = 5·mean(c)−200 — so the generalized implementation does not deviate from the confirmed MVP method in the launch mode.

### 1.5 Range-width model (§11) — `widthModel.js`

`halfWidth(n, sd) = min(40, 5 + (15−5)/√n + 0.5·sd)` corrects. The **shape** is statistics (√n = standard-error decay of averaged noisy measurements; + sd term makes consistency visible); the **constants are provisional** and flagged as such on every prediction (`widthModel.provisional: true` + `PROVISIONAL_WIDTHS` warning), per §11's "exact widths are set during Phase 4/5 calibration". Evidence for the current values: `scripts/phase3/calibration_report.js` (below).

### 1.6 Distribution model + verified store — `distributionModel.js`, `store.js`

- Exact-lookup semantics over the committed NBEMS 2025 bands, honoring two facts verified during implementation: stored `[minRank, maxRank]` are the **official ranks** (the 18 WITHHELD candidates interleave inside band intervals — sum of counts = 230,096 numeric pairs while the last rank is 230,114), and adjacent bands are rank-contiguous, so an **unobserved score inserts at exactly the lower band's minRank** (a 706-scorer would be rank 2).
- Percentile formula **reused as pinned by Phase 2** (`100×(1−rank/230,096)`); withheld-tail ranks clamp at 0.
- Inverse lookup (rank→score, linear interpolation across score gaps) for the Tier 2 path.
- Runtime build-time integrity assertions (contiguity, counts, rank-1 anchor) — a changed snapshot shape fails loudly, never serves quietly wrong numbers.
- **Store**: every snapshot SHA-256-verified against `MANIFEST.json` on first load (complements the Phase 2 golden validator, which checks pinned values); tamper/unlisted-path failures throw `DATA_INTEGRITY`. This is the engine's only filesystem contact.

### 1.7 Result record (Phase 9-ready) — `index.js`

`engine.predict()` returns estimate + inputs + method metadata: method version `neetpg-percentile-transfer-p3.v1`, assumptions, dedup rule id, width-model id + params + provisional flag, **dataset snapshot ids**, per-GT tier/provenance/exclusions, aggregation stats with alternatives, warnings (`LOW_GT_COUNT` §14, `NO_SKIP_ASSUMPTION_WEAKENED`, `MIXED_TRANSFER_TIERS`, `PROVISIONAL_WIDTHS`), and UI-ready note strings (no-skip, parity, disclaimer, percentile definition). Coverage states are explicit (`full | partial-top | partial-bottom | above-distribution | below-distribution`) — §12-style honesty at the percentile stage, no fabricated endpoints.

## 2. Calibration inspection (inspected-data evidence, §5.3)

`node scripts/phase3/calibration_report.js` — key outputs (full table in the script run):

| mean corrects | 1 GT (tight) | 8 GT (tight) | 3 GT ±25 |
|---|---|---|---|
| 60 (score 100) | pct 0.29–23.90 | pct 1.67–15.40 | pct 0–35.06 |
| 100 (score 300) | pct 37.11–69.63 | pct 45.55–63.59 | pct 25.98–76.63 |
| 140 (score 500) | pct 77.90–97.26 | pct 83.18–94.41 | pct 71.00–99.31 |
| 170 (score 650) | pct 97.17–100 (partial-top) | pct 99.01–99.997 | pct 93.43–100 (partial-top) |

- Center percentile is **non-decreasing in mean corrects with zero interior ties** across 20→190.
- More GTs → visibly narrower; scattered GTs → visibly wider (§11 properties pinned by tests).
- 1-GT widths are wide by design (single noisy measurement + unknown parity-transfer error).

## 3. Files

**New** — `server/predictor/`: `index.js`, `config.js`, `errors.js`, `store.js`, `validation.js`, `aggregation.js`, `widthModel.js`, `transfer.js`, `distributionModel.js`, `strategies/{index,neetPg,iniCet}.js` · `server/tests/predictor/`: 8 suites (validation, aggregation, widthModel, distributionModel, store, transfer, strategies, engine) · `scripts/phase3/calibration_report.js` · this report.
**Modified** — `docs/RANK_AND_BRANCH_PREDICTOR.md` §20 (status only).
**Untouched** — all app code/routes/client in both repos; `server/predictor-data/*` (hashes intact); quiz engine (engine imports nothing from it, §19.10).

## 4. Tests / validation performed

| Check | Result |
|---|---|
| New predictor unit tests | **97/97 pass** (8 suites; run `cd server && npx jest tests/predictor`) |
| Full website server suite (`cd server && npm test`) | **126/126 pass** (11 suites incl. the 3 pre-existing) |
| Phase 2 snapshot validator | **30/30 pass** (data untouched) |
| Calibration script | runs clean; monotonicity YES, 0 interior ties |

Notable pinned tests: Tier-1/§3.3 identity; Tier-2 flip + fallbacks (synthetic cohorts in tests only, never stored — §4); dedup precedence (incl. retest-over-later-plain); spec §11 width properties (using equalized means — see §5 note); golden anchors (707→rank 1, band 695, 230,096 pairs) reused from Phase 2 fixtures; hash tamper detection.

## 5. Findings, decisions, and items for review

1. **Spec §11's illustrative example is arithmetically off** — (120/122/121) mean 121 vs (90/140/115) mean 115; the sets do not share a mean. No methodology impact (the *property* — dispersion widens — is what §11 requires and it is tested with equalized means). Noted in the test; spec text left unchanged (editorial).
2. **DECISION — APPROVED by product owner 2026-09-20:** skipped questions in auto-captured GTs → include with the `NO_SKIP_ASSUMPTION_WEAKENED` warning (recorded in `server/predictor/config.js`).
3. **DECISION — APPROVED by product owner 2026-09-20:** provisional constants (width model `15 / 5 / 0.5 / 40`, Tier-2 threshold `100`) stay as the calibration baseline until real Eyeconic data exists; never narrowed for launch reasons (recorded in `server/predictor/config.js`).
4. Percentiles are reported to **3 decimals**: at the top of the distribution 2dp collapses genuinely different ranks onto 100 (rank 40/230,096 is already 99.983), faking a point prediction at the top end.
5. Tier-2 percentile→score inversion falls back to Tier 1 when the cohort percentile lands above/below the recorded distribution (e.g. a cohort where everyone is above 707) — recorded as a fallback reason, never extrapolated.
6. The engine is **deliberately unmounted** — no route imports it yet (Phase 7 owns exposure + persistence; Phase 9's "no unpersisted prediction" rule starts there).

## 6. Next

**Phase 4 — NEET PG rank prediction**: `resolveRankRange` on the official distribution (per-year anchors, 800-scale), monotonicity + official-anchor checks, and the "spot-check pairs reproduce exactly" acceptance test. The distributionModel already provides the exact lookups Phase 4 will compose.
