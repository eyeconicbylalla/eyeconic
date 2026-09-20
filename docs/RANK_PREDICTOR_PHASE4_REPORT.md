# Rank & Branch Predictor — Phase 4 Report (NEET PG Rank Prediction)

| | |
|---|---|
| **Status** | Phase 4 COMPLETE (2026-09-20) — `resolveRankRange` live; 16 new tests; predictor suite 113/113; full server suite 142/142; full-corpus reproduction **100.0000% (41,695/41,695)**; Phase 2 validator 30/30 (goldens extended additively) |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §18 Phase 4 |
| **Approvals exercised** | Phase 3 provisional baselines confirmed by product owner 2026-09-20: width constants (15/5/0.5/40) and Tier-2 threshold (100) stay as baseline pending real-data calibration; auto-captured GTs with skips are included with the `NO_SKIP_ASSUMPTION_WEAKENED` warning. Both recorded in `server/predictor/config.js`. |

## What was implemented

### 1. Rank-range resolution — `server/predictor/rankResolution.js`

Exact AIR-range resolution of the Phase 3 performance range through the official NBEMS 2025 distribution (per-year anchor 2025, 800-scale — the snapshot id and exam year are echoed on every result, §10):

- **In-data**: best rank = band minR at the range's top score; worst rank = band maxR at the bottom score. Lookups consume the estimate's **unrounded internals** (`estimate.internal`, added in this phase) so display rounding (≤0.25 marks) can never shift rank endpoints — rank outputs are exact integers.
- **Partial-top**: upper end beyond the last recorded score ⇒ best rank = 1 + `bestBeyondData` flag (rank 1 is the best achievable; nothing beyond is invented).
- **Partial-bottom / below-distribution**: lower end below the recorded data ⇒ worst rank = `null` + `beyondLastRecordedRank` echo (230,114) — §12 honesty, no fabricated numbers.
- **Above-distribution**: whole range above the data ⇒ `[1, 1]`.
- Internal invariant enforced: best ≤ worst whenever both resolve in-data (an inversion is a lookup bug and throws).

### 2. Pipeline + metadata

- NEET PG strategy `resolveRankRange` implemented (no longer throws); `resolveBranches` still throws `STEP_NOT_IMPLEMENTED → Phase 6`.
- `engine.predict()` now returns `result.rank` alongside `result.estimate`; `method.stage` = `RANK_RANGE`.
- **Method version bumped** to `neetpg-rank-transfer-p4.v1` (a stage was added; transfer math unchanged).

### 3. Golden anchors (verified this phase)

Official NEET-PG 2025 qualifying scores by category percentile (NBEMS result notification 19.08.2025): **UR/EWS 50th → 276 · UR-PwD 45th → 255 · SC/ST/OBC 40th → 235**. Pinned in `golden/v1/goldens.json` (`phase4_anchors`, additive; MANIFEST hash updated). Provenance note: the three values were obtained from secondary reports of the official notice (2026-09-20) and then **verified to agree EXACTLY with the primary-source distribution** — `scoreForRank((1−p/100)×230,096)` returns each score exactly. The distribution (parsed from the official NBEMS PDF in Phase 2) and the independently published cutoffs therefore corroborate each other. Upgrade path recorded in the golden note: fetch the official notice PDF and re-pin as primary-source.

**Data-context note:** NBEMS issued a percentile-reduction notice on 13-01-2026 (UR 50th → 7th) for NEET-PG 2025 counselling, since challenged in the Supreme Court. This does not affect Phase 4: the predictor's distribution is the 19.08.2025 **result** distribution (correct anchors = the result-notification values), and the counselling snapshots are final-state *actual allotments*, which encode whatever cutoffs actually governed.

## Validation results (spec §18 Phase 4 done-when)

| Done-when requirement | Result |
|---|---|
| AIR ranges produced | ✅ across full/partial-top/partial-bottom/above/below coverage states |
| Monotonicity checks pass | ✅ best & worst ranks never worsen as corrects rise (40→190 sweep); more tight GTs never widen the range; percentile↔rank inversion cross-check agrees within 1 rank (3dp rounding) |
| **100% of a spot-check of official score→rank pairs reproduces exactly** | ✅ **41,695/41,695 = 100.0000%** — every final-state mirror (score, rank) pair through the engine lookup (`scripts/phase4/verify_rank_reproduction.js`; corpus = Phase-2-verified crockzo final state; known rank-143757 exception did not appear in the final-state corpus). Plus every 5th band (~144) of the official distribution reproduces its exact interval in unit tests |
| Official category-cutoff anchors agree | ✅ 276 / 255 / 235 land exactly on the distribution at the 50th/45th/40th percentile ranks (golden-pinned, unit-tested) |
| Backtesting claims | None made — impossible without paired GT↔outcome data (spec §4); documented limitation, unchanged |

## Files

**New** — `server/predictor/rankResolution.js` · `server/tests/predictor/rankResolution.test.js` · `scripts/phase4/verify_rank_reproduction.js` · this report.
**Modified** — `server/predictor/transfer.js` (estimate now carries unrounded `internal` endpoints) · `strategies/neetPg.js` (rank step live) · `index.js` (rank stage in pipeline + result) · `config.js` (method version bump; approval notes) · `server/predictor-data/golden/v1/goldens.json` + `MANIFEST.json` (additive `phase4_anchors`; hash consistent) · `scripts/phase3/calibration_report.js` (now prints exact Phase 4 AIR ranges instead of a preview inversion) · `docs/RANK_AND_BRANCH_PREDICTOR.md` §20 · Phase 3 report §5 (approval notes).
**Untouched** — all app code/routes/client; distribution/counselling snapshots (hashes intact); Phase 3 transfer math and width model (baseline-locked per approval).

## Tests / validation performed

- `cd server && npx jest tests/predictor` → **113/113** (97 Phase 3 + 16 Phase 4)
- `cd server && npm test` → **142/142** (12 suites, incl. the 3 pre-existing)
- `python scripts/phase2/validate_snapshots.py` → **30/30** (goldens extension is additive; MANIFEST hash updated)
- `node scripts/phase4/verify_rank_reproduction.js` → **PASS 100.0000%**
- `node scripts/phase3/calibration_report.js` → clean; exact AIR ranges rendered

## Limitations & notes

1. **Single-year anchor (by design for MVP)**: rank resolution runs against the 2025 distribution only. When a new year's official distribution is ingested, it arrives as a new snapshot + config entry (§10 pattern-versioning rule) — the resolution code is year-agnostic.
2. **Qualifying-anchor provenance**: exact-agreement verification is strong mutual corroboration, but the primary notice PDF has not been fetched; the golden note records the upgrade path. (The Jan-2026 percentile-reduction notice is a counselling event and does not alter the result-distribution anchors.)
3. The known crockzo rank-143757 substitution did not surface in the final-state corpus (0 exceptions needed); the verification script still guards for it.
4. No API/persistence yet — the engine remains unmounted (Phase 7, with Phase 9 persistence built in the same phase).

## Next

**Phase 6 — branch/college prediction (M1 portion)**: cutoff matching over the 2024+2025 final-state counselling snapshots (category/quota/pwd filters, §12 bands and extreme-range states), gated on `validateForBranches`. Acceptance: ~50 sampled historical allotments show the actually-allotted branch among the predicted possibilities, with year/round/category context on every row.
