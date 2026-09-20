# Rank & Branch Predictor — Phase 6 Report (Branch/College Prediction, M1 = NEET PG)

| | |
|---|---|
| **Status** | Phase 6 (NEET PG portion) COMPLETE (2026-09-20) — 21 new tests; predictor suite 134/134; full server suite 163/163; **allotment recall 100/100 (100.0%)**; Phase 2 validator 30/30 |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §12, §18 Phase 6 |
| **Prior phases** | P3 engine (`RANK_PREDICTOR_PHASE3_REPORT.md`), P4 rank (`RANK_PREDICTOR_PHASE4_REPORT.md`) — transfer math, width model, and rank resolution untouched |

## What was implemented

### 1. Cutoff matching — `server/predictor/branchMatching.js`

Matching of the Phase 4 AIR range against the imported **final-state** counselling snapshots (2024 + 2025), filtered by **category + PwD + quota** (MVP: AIQ only, per §3.6):

- Every result row carries the §12 context: institute, branch, **historical closing rank**, opening rank (display context per §6C), allotted count, **year**, round convention, category, quota. The round label is honest to the data: `final state (end of counselling)` — the approved Phase 2 cutoff semantics (R2/R3 changes-only lists are never standalone tables; per-round views remain possible later from the preserved normalized layer).
- Rows within a band sort by closing rank; counts per band + total are returned; nothing is silently truncated (a realistic mid-range OBC AIQ student gets ~2,300 groups/year — Phase 7 will paginate the API; the engine returns the full matched set).

### 2. Possibility banding — grounded in measured cutoff drift (§12)

Four bands against the historical closing rank CR (ranks: smaller = better):

| Band | Condition | Meaning |
|---|---|---|
| COMFORTABLE | worst ≤ CR | even the pessimistic end of the predicted range clears the historical close |
| WITHIN_RANGE | best ≤ CR < worst | part of the range clears the close |
| BORDERLINE | best ≤ CR×1.35 | best case beyond the close, inside the observed drift margin |
| ASPIRATIONAL | best ≤ CR×1.75 | extreme-tail drift territory |
| (excluded) | beyond | not shown |

**The margins are measured, not invented** (`scripts/phase6/compute_band_margins.py`, committed + re-runnable): closing-rank drift between the two imported years over the **5,872 exactly-keyed matched groups** (the M1 join key documented in `name-normalization-v1`) — median 19.2%, **p75 32.4%**, p95 66.8%. BORDERLINE_MARGIN 0.35 sits just above p75 ("3/4 of matched groups historically moved less"); ASPIRATIONAL_CAP 0.75 sits beyond p95. Per-category drift is homogeneous (p75 0.28–0.34 across UR/OBC/SC/ST/EWS), so one global margin set is used. Margins are provisional (like all constants), pinned in `config.BRANCH_BANDS` with the evidence pointer, and echoed in every branch result's `dataCoverage`.

### 3. §12 extreme-range / empty states (no fabricated results)

- `CATEGORY_REQUIRED` — §3.6 gate: no branch results without a category; the engine still serves percentile + rank (category-agnostic) and surfaces this explicit state (never a silent UR default).
- `BEYOND_LAST_CLOSING` — the range is worse than every recorded closing in the filtered set; the state names the coverage (years, quota, category).
- `PARTIAL` — optimistic end matches but the pessimistic end is beyond the data (e.g. Phase 4 `worstRank: null`).
- `NO_DATA_FOR_FILTER` — the filtered slice is empty (e.g. a category×pwd×quota combination absent from a year).
- `aboveAllClosings` flag — the whole range beats even the tightest closing (§12 "at or above the top of the historical admissions data").

### 4. Pipeline + metadata

- NEET PG strategy `resolveBranches` live (the full interface is now implemented); counselling indexes loaded through the hash-verified store (cached per process).
- `engine.predict()` returns `result.branches`; `method.stage` = `BRANCHES` when a category is present, else `RANK_RANGE`.
- **Method version bumped** to `neetpg-branch-p6.v1`.

## Validation results (spec §18 Phase 6 done-when)

| Requirement | Result |
|---|---|
| ~50 sampled historical allotments: allotted branch appears among possibilities | ✅ two forms: (a) per-candidate — **100/100 sampled AIQ allotment rows** (41 UR, 28 OBC, 13 SC, 11 EWS, 7 ST) recalled via the engine matcher, matched by normalized keys (`scripts/phase6/verify_allotment_recall.js`); (b) in-repo — 50 sampled snapshot groups per year recalled 100% at their closing ranks (runs in the committed test suite, no gitignored data needed) |
| Results carry year/round/category context | ✅ asserted on every row in tests (year, final-state round label, category, quota) |
| Banding validated against the data | ✅ drift-percentile grounding above; borderline behaviour pinned by a test (rank 20% beyond closing → BORDERLINE) |
| No guarantee language | ✅ notes: "Historical possibility, not a guarantee…" on every branch result |
| No state-quota expansion | ✅ AIQ only; other quotas rejected at validation with an explicit message |

## Files

**New** — `server/predictor/branchMatching.js` · `server/tests/predictor/branchMatching.test.js` · `server/tests/predictor/branchAcceptance.test.js` · `scripts/phase6/compute_band_margins.py` · `scripts/phase6/verify_allotment_recall.js` · this report.
**Modified** — `server/predictor/config.js` (BRANCH_BANDS + method version) · `strategies/neetPg.js` + `strategies/index.js` (branch step + counselling loading) · `index.js` (branches in pipeline, CATEGORY_REQUIRED state) · tests updated (`strategies`, `engine`).
**Untouched** — app code/routes/client; all snapshot data (hashes intact); Phase 3/4 math (transfer, widths, rank resolution).

## Tests / validation performed

- `cd server && npx jest tests/predictor` → **134/134** (113 + 21 new)
- `cd server && npm test` → **163/163** (14 suites, incl. the 3 pre-existing)
- `python scripts/phase2/validate_snapshots.py` → **30/30**
- `node scripts/phase6/verify_allotment_recall.js` → **100/100 (100.0%)**; `python scripts/phase6/compute_band_margins.py` → evidence table
- Cold end-to-end smoke: GTs [128, 131] OBC → AIR 20,612–67,441 → MATCHED, 2,240 (2024) + 2,352 (2025) groups, correct band placement and per-row context

## Limitations & decisions

1. **Result volume**: a mid-range student legitimately has thousands of historically-possible groups. The engine returns the full matched set with counts; Phase 7's API must paginate/filter before any UI renders it. No silent truncation exists today by design.
2. **Display-name duplication (known Phase 2 open item)**: institute strings are MCC's concatenated campus variants; near-duplicate variants can yield sibling rows for the same physical branch (keys are exact-normalized strings both years join on). Display-alias cleanup is a UI-layer refinement; matching correctness is unaffected (recall verified by key).
3. **Band margins** are provisional — computed on the matched subset (stable-string programs); recalibrate at Phase 11. Never to be narrowed for launch reasons (§18).
4. pwd defaults to not-PwD when a category is given without a pwd flag (documented in code) — the §3.6 "never defaulted" rule applies to category, which is enforced.
5. Round dimension: final-state only (approved Phase 2 semantics); round-wise display would need the per-round views from the normalized layer — future refinement, not an M1 gap.

## Next

**Phase 7 — backend API with prediction persistence (Phase 9 built in)**: endpoints (predict, GT auto-fill retrieval tagged auto-captured/self-reported), auth, response contract (ranges, coverage, methodology + limitation notes, method version + dataset snapshot ids), and persistence of every served prediction. No prediction may be servable without being stored.
