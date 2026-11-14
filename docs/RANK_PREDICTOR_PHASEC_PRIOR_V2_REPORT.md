# Phase C — INI-CET prior v2 + 2027-01 anchor swap (2026-11-14)

One-line scope: replace the weakest step of the INI-CET predictor — the
corrects→AIR crowd ladder — with a fresh, session-coherent pair: **prior v2**
(r/INICET Nov-2026 community compilation, 39 self-reports pooled to 18
monotone rungs) × **official distribution DS-INICET-DISTRIBUTION-202701-v1**
(the Phase A snapshot of Notification 304/2026). Every stored record from the
old era re-derives byte-identically via the new `anchorHistory` route
(the INI-CET analogue of NEET PG's `patternHistory`).

## The new ladder (priors/inicet/v2/corrects-air-202701.json)

- Built by `scripts/phaseC/build_inicet_prior_v2.py` (deterministic, no curve
  fitting): each report's actual marks → **no-skip-equivalent corrects**
  c = (3·marks+200)/4 (identical to the compilation sheet's own "if all 200
  attempted" column — composes exactly with the engine's pattern arithmetic)
  → explicit cluster buckets → rung AIR = geometric mean of members →
  monotonicity asserted (18/18). `source_points` keeps all 39 raw rows.
- Span: **110 → 169.88 corrects (AIR 21,000 → 4)** — the v1 era spanned
  110–160 (AIR 28,000–10). Strong students above ≈147 marks finally get an
  answer instead of "above-prior".
- Excluded with reasons (kept as cross_check_points): the asterisked
  "Rank 27*/155c/140m" self-post (drift ×0.11 — exclusion asserted by the
  consistency script); the "~100 marks → AIR 5–6k" snippet is NOT an outlier
  (×1.62 vs the table's 8,900 — inside the crowd-noise band; kept as a
  corroborating cross-check).
- One sheet typo reconciled from the sheet's own column: 126.3m at "AIR
  2,215" read as 1,215 (makes all 39 points monotone).

## Era routing (old records never break)

- `EXAMS.INI_CET.anchorHistory[0]`: `inicet-branch-p6.v1` /
  `desired-inicet-v1` / `inicet-required-inverse-ladder-v1` → Jul-2025
  anchor + Hazra v1 prior. `strategies.legacy()` now dispatches per exam
  (NEET patternHistory ∪ INI anchorHistory).
- `store.loadIniCetPrior(file)` is config-driven (no default path); the INI
  strategy takes a `profile` (methodVersion/distribution/prior/desired
  versions/**priorSourceLabel**).
- Era-exact strings: the warning/note labels ("Dr Mayukh Hazra compilations"
  vs "r/INICET community compilations (Nov-2026)") live in config per era —
  the desired-branch GET re-derives and hash-compares, so legacy notes
  reproduce byte-identically (pinned by tests).
- Version bumps: `inicet-branch-p7-v1`, `desired-inicet-v2`,
  `inicet-required-inverse-ladder-v2`, `readiness-inicet-v2`. Stored
  **readiness** records re-derive under the current engine and surface the
  standard `verified:false + diff` annotation (designed behaviour — readiness
  is served from its stored result regardless).

## What changes for a student (same GT inputs)

| input | old ladder said | v2 says |
|---|---|---|
| 155c ×2 GTs (140 marks) | "above-prior" (better than AIR 10 — no bound) | **AIR 9–1,533, full coverage** |
| 135c ×1 | AIR 302–16,789 | AIR 553–12,139 |
| desired GenMed UR safe end (closing 4) | open-ended (above-ladder) | **170c** (the ladder reaches AIR 4) |
| desired GenMed UR likely end (closing 2,910) | 134c | **139c** |
| readiness STRONG anchor (AIR 4) | open-ended | **170c, in-ladder** |
| readiness ANY_SEAT anchor (44,418) | 110c conservative floor | unchanged (still below the 21,000 floor) |

Warnings unchanged: `CROWD_SOURCED_PRIOR`, `PRIOR_UR_ONLY` (UR-only labelling
retained), `PROVISIONAL_WIDTHS`, difficulty-parity note. The ladder is still
crowd data — now current and wide-spanning instead of 16 months old.

## Verification trail (all green)

1. Suite **578/578** (32 suites; +5 new: v2 prior pins, 2027-01 official
   model, legacy routing ×2, top-rung reverse golden).
2. `validate_snapshots.py`: **175 PASS** (prior v2 pins + v1 legacy pins +
   source-point traceability; the one pre-commit FAIL is the uncommitted-
   goldens blob check — green again post-commit).
3. `inicet_consistency_report.js`: PASS — v2 span checks, outlier-exclusion
   assertion, corroborating cross-check inside band, ladder inside the
   official rank space, official round-trip, calibration table.
4. Client vite build ✓ (one display string updated to source-neutral wording
   in DesiredBranchResult.tsx).
5. Legacy byte-identity pinned: stored `inicet-branch-p6.v1` /
   `desired-inicet-v1` methodVersions re-derive on the Jul-2025 pair
   (snapshot ids, prior id, session and rank values pinned in tests).

## Commits

1. data: prior v2 + MANIFEST + goldens (prior v1 pins annotated) + builder
   script + validator/store-inventory updates.
2. engine swap: config (anchor, prior, versions, anchorHistory,
   priorSourceLabel) + store/strategy/legacy routing + era-exact strings +
   test pins + client string + consistency script + this report.

## Not in this phase (unchanged plan)

- Phase D outcome-capture campaign (the ladder is still crowd data until our
  own students' pairs calibrate it), Phase E Jul-2026 backfill, Phase F
  Jan-2027 counselling (reminder ~Feb–Mar 2027), Phase G honesty report.
- Deploy: NOT deployed by this phase. Before deploying eyeconic-server,
  re-verify the Vercel env vars are fully restored (September incident), then
  run the prod smoke script (`server/scripts/verify_prod_inicet_predictor.js`).
