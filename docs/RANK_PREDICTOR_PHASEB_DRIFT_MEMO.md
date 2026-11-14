# Phase B — Old-ladder vs Nov-2026 drift memo (2026-11-14)

Question: how wrong is the live INI-CET corrects→AIR step (crowd ladder,
Jul-2025 session) for students of the Nov-2026 exam? Answer: **materially
wrong at every level except the very bottom, and ~8× wrong at the top** —
the Phase C swap (prior v2 anchored on 2027-01) is urgent and the data to
build it already exists in good quality.

## Inputs

1. **Fresh crowd table (primary)** — r/INICET "INICET NOV 2026 RANKS"
   compilation (operator screenshot, transcribed): 39 self-reported
   (correct, incorrect, score/200, AIR) rows for the Nov-2026 exam,
   AIR 4 → 21,000, marks 160.3 → 80.0.
   - One sheet typo reconciled from the sheet's own last column:
     126.3 marks listed at AIR "2,215" but the normalized column says
     1,215 — with 1,215 the table is **monotone in marks space with ZERO
     violations** (39/39). Cleanest crowd artifact we have ever had.
2. **Official distributions (both sides)** — committed snapshots
   DS-INICET-DISTRIBUTION-202507-v1 / -202701-v1 (Phase A).
3. **Excluded points** — self-report "Rank 27* / 155c / 140m" (asterisk;
   inconsistent with the table's 142m→192; likely a category rank);
   pre-result predictions ("Rank 1 won't cross 155", "148→AIR40" thread —
   contradicted by actuals; the "Rank 1 = 160 correct" meme conflates
   marks/corrects: AIR 4 = 160.3 MARKS); snippet "~100m → AIR 5–6k"
   (conflicts with the table's 8,900 — kept as a flagged cross-check).

## Independent validation of our Phase A parse

The community "engineer's sheet" (derived from the official PDF) shows
rank 4 → 99.995 and rank 9 → 99.987. Our 2027-01 snapshot gives 99.9951 /
99.9870 — exact agreement to the published precision.

## Session shape (official)

| session | registered (implied N) | qualified | last rank |
|---|---|---|---|
| Jul-2025 | ~89,800 | 46,884 | 49,248 |
| Nov-2026 | ~62,000 | 32,495 | 33,862 |

## Drift table (crowd Nov-26 vs live Jul-25 ladder, marks space)

| marks | Nov-26 AIR (crowd) | old-ladder AIR | old/new | same marks, percentile drop |
|---|---|---|---|---|
| 160.3 | 4 | above-prior (no answer) | — | — |
| 150.3 | 35 | above-prior (no answer) | — | — |
| 148.3 | 59 | above-prior (no answer) | — | — |
| 142.0 | 192 | 22 | 0.12× | −0.28 |
| 136.7 | 320 | 56 | 0.17× | −0.46 |
| 130.0 | ~820 | 178 | 0.22× | −1.1 |
| 122.3 | 1,911 | 672 | 0.35× | −2.3 |
| 117.0 | 2,900 | 1,510 | 0.52× | −2.9 |
| 110.0 | 5,000 | 3,162 | 0.63× | −4.5 |
| 100.0 | 8,900 | 6,325 | 0.71× | −7.4 |
| 93.0 | 12,700 | 10,260 | 0.81× | −9.0 |
| 84.0 | 18,771 | 20,559 | 1.10× | −7.4* |
| 80.0 | 21,000 | 28,000 | 1.33× | −2.5* |

\* percentile drop ≠ rank improvement at the bottom: Nov-2026 has a much
smaller candidate pool, so a worse/better rank maps to percentile
differently; in RANK terms the bottom is ~1.1–1.3× BETTER per mark now.

## Findings

1. **The live ladder overpromises at the top by ~8×** — a 142-mark
   (≈155-correct) student is told "AIR ~22"; Nov-2026 reality is ~192.
   At 130 marks: told ~178, reality ~820.
2. **Mid-range ~2–3× overpromise** (117–130m); low range ~1.2–1.4×
   (100–93m); **crossover ≈ 85m** — below that, ranks per mark slightly
   improved (smaller pool).
3. **Coverage win**: the crowd table spans 80 → 160.3 marks vs the live
   ladder's 80 → 146.7 — the "above-prior" dead zone above 146.7m (where
   v1 refuses to answer) is now covered up to AIR 4.
4. Reading: the Nov-2026 paper was easier at the top / the top cohort
   scored higher, while ~28k fewer candidates sat the exam. Same marks
   buy a percentile up to ~9 points lower.

## Consequence for Phase C (the swap)

- Build **prior v2** from these 39 points (pool to ~10–12 monotone rungs,
  marks space, session `2027-01`), pair with the Phase-A official
  distribution (session-coherent), bump method versions with legacy
  re-derivation routes, keep every crowd-sourced/UR-only warning label.
- All crowd caveats stay: self-reported, community-compiled, no official
  marks exist. The `~` qualifier stays on interpolated rungs.

— computed by the Phase B drift script (interpolation mirrors the engine:
log-AIR piecewise-linear in marks; old-side percentiles from the official
Jul-25 rows, new-side from the official Nov-26 rows).
