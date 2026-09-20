# Rank & Branch Predictor — Phase 9 Report (Prediction History)

| | |
|---|---|
| **Status** | Phase 9 COMPLETE — implemented **within Phase 7 by approved design** (spec §18: "Phase 9 is built inside Phase 7 — no prediction may be served before persistence exists"); this session (2026-09-20) delivered the requirement-by-requirement audit, a standalone re-runnable verification command (**13/13**), and this report. Full server suite **185/185** (15 suites) re-run green. |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §18 Phase 9 (requirements), §15 (why persistence precedes outcome capture), §5.4 (transfer tier), §6A (input provenance) |
| **Code** | `server/models/Prediction.js` · `server/routes/predictor.js` (both shipped with Phase 7 — unchanged by this session) |

## 1. Phase 9 done-when, and where it lives

> §18 Phase 9: *Store per prediction: inputs (each tagged auto-captured vs self-reported), aggregation used, transfer tier used, method version, dataset snapshot version, outputs (ranges), data-coverage references, timestamp, user.* … *Done when: predictions are persisted and reproducible (method version + dataset snapshot + inputs retrievable).*

Requirement-by-requirement audit (all verified against the code and by the runs in §3):

| §18 Phase 9 requirement | Implementation | Test coverage |
|---|---|---|
| Every prediction stored, from the first served one | `POST /predict` writes the `Prediction` document **before** the 201; a failed write returns `500 PREDICTION_NOT_STORED` and **no prediction is served**; a persistence gate (`requireDb`) self-heals dropped Mongo connections (503 when truly unreachable) | forced-write-failure test; self-heal + unreachable-DB regression tests |
| inputs, each tagged auto-captured vs self-reported | `input.gts[].provenance` (per selected AND excluded attempts) + the **exact request body** in `request` for byte-faithful re-derivation | API tests assert provenance on results; verify script check 2e |
| aggregation used | `aggregation` stage (n, values, mean + median/trimmed-mean alternatives, sd, low-data caution) + `method.aggregation` (method + dedup rule id) | engine + API suites |
| transfer tier used (§5.4) | `estimate.transfer.tiers` (per-tier GT counts; API runs Tier 1 at launch) | API test pins `{TIER_1: 2, TIER_2: 0}` |
| method version | `methodVersion` + full `method` block | API tests pin `neetpg-branch-p6.v1` |
| dataset snapshot version (exact ingested data) | `method.datasetSnapshots` = `{distribution, counselling[]}` snapshot ids | API test pins the ids; verify script check 2d |
| outputs (ranges) | `estimate.percentile.range` + `rank.rankRange` + `branches` summary | range-ordering asserted end-to-end |
| data-coverage references | `branches.dataCoverage` + covered `years[]` + snapshot ids | verify script check 2h |
| timestamp | `createdAt` (mongoose timestamps) | history endpoint returns it |
| user | `userId` (canonical App `User._id`; own-only retrieval, cross-user 404) | own-only tests |
| Reproducible | `GET /predictions` (history), `GET /predictions/:id` (full record + recomputed `resultHash` integrity check), `GET /predictions/:id/branches` (rows re-derived from stored request + method + snapshots and **verified** against stored counts; drift surfaces an explicit `verification` block, never a silent mismatch) | API suite; verify script checks 3–5 |
| "Not yet: no accuracy analysis" | none present — correct for this phase | — |

**No unpersisted serving path exists:** the engine (`server/predictor/`) is consumed only by `routes/predictor.js` (persists), tests, and the offline Phase 3 calibration script. The client reaches the engine exclusively through `POST /predict`.

## 2. Design decisions (made in Phase 7, restated here as the Phase 9 record)

1. **Persist-before-serve** is the phase's core guarantee — an unpersisted prediction is a calibration sample lost forever (§15/§18).
2. **Branch rows are not stored** (~2,300 rows/year would bloat every document); they are a deterministic function of (request, method version, snapshot versions) — all stored — and are re-derived + verified on demand.
3. **`resultHash`** (sha256 over canonical JSON of the six result stages) pins stored predictions against tampering/corruption; retrieval recomputes it.
4. Retrieval is **own-only** (404 cross-user); history and branch rows are paginated.

## 3. Verification performed (this session, all fresh runs)

| Check | Command | Result |
|---|---|---|
| Phase 9 lifecycle (NEW — the phase's standalone done-when command) | `node scripts/phase9/verify_prediction_persistence.js` | ✅ **13/13** — real app + in-memory Mongo: predict → stored with the full §9 field set → history → integrity hash matches → branch re-derivation verifies → rank-only prediction persisted |
| Full server suite (includes the 20-test predictor API suite: persist-before-serve, forced write failure, own-only, integrity, re-derivation) | `cd server && npm test` | ✅ **185/185** (15 suites) |
| Snapshot store integrity (data the predictions ran against) | `python scripts/phase2/validate_snapshots.py` | ✅ ALL CHECKS PASSED |
| Rank reproduction (Phase 4 unchanged) | `node scripts/phase4/verify_rank_reproduction.js` | ✅ 41,695/41,695 exact |
| Allotment recall (Phase 6 unchanged) | `node scripts/phase6/verify_allotment_recall.js` | ✅ 100/100 |
| Client build (UI consumes the persisted API only) | `cd client && npm run build` | ✅ builds (pre-existing chunk-size warnings only) |

## 4. Files

**New (this session)** — `scripts/phase9/verify_prediction_persistence.js` · this report.
**Modified (this session)** — `docs/RANK_AND_BRANCH_PREDICTOR.md` §20 (Phase 9 report added to the chain; verification footnote gains the Phase 9 command; stale suite count 181 → 185) and the spec status row (Phases 0–3 → 0–9).
**Untouched** — `server/models/Prediction.js`, `server/routes/predictor.js`, the engine, snapshot data, the client. No schema, API, or behavior change: Phase 9's implementation shipped with Phase 7 and passed this audit without modification.

## 5. Limitations & carried decisions

1. **Row re-derivation uses the current engine/snapshots**: after a future method bump or re-ingestion, old predictions' rows report `verified: false` with an explicit stored-vs-recomputed diff (stored summary/counts always reflect what was served) — Phase 7 decision, unchanged.
2. **Accuracy analysis is deliberately absent** (§18 Phase 9 "Not yet") — no ground truth exists until outcome capture (Phase 10a) fills the paired dataset.
3. Rate limit (60/hour/user) and pagination defaults are API-layer ergonomics, per the Phase 7 report.

## 6. Where M1 stands

Phases 0–9 complete and verified: data → engine → rank → branches → API **with persistence** → UI, one live predictor. **Remaining for M1: Phase 10a** — the minimal consent-based outcome-capture form (actual score / percentile / rank linked to the stored prediction's method + dataset snapshot versions and the GT history), timed to the next real result window (§18 sequencing rule).
