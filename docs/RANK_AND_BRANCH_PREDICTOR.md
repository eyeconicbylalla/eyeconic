# Rank & Branch Predictor — Feature Specification

| | |
|---|---|
| **Feature** | Rank & Branch Predictor (Eyeconic Mentorship App) |
| **Status** | M1 + M2 COMPLETE (Phases 0–10b, 2026-09-20) — NEET PG + INI-CET live, full outcome capture + evaluation-dataset assembly shipped — see §20; engine `server/predictor/` |
| **Exams (MVP)** | NEET PG, INI-CET |
| **MVP methodology** | Percentile-Transfer Prior (statistical estimate, not ML) |
| **Supersedes** | Legacy `client/src/pages/GtPredictor.tsx` (single-GT + hardcoded uplift bands) — retired/redirected when Phase 8 ships; the two must never be live together |
| **Source research** | `rank-predictor-data-research.html` (repo root, 2026-09-18) |
| **Last updated** | 2026-09-20 |

This document is the single source of truth for how the Rank & Branch Predictor is intended to work. It is written to be used directly as the implementation plan.

---

## Table of Contents

1. [Feature Purpose](#1-feature-purpose)
2. [MVP Exams](#2-mvp-exams)
3. [User Input](#3-user-input)
4. [Critical Data Limitation](#4-critical-data-limitation)
5. [MVP Approach — Percentile-Transfer Prior](#5-mvp-approach--percentile-transfer-prior)
6. [Data Required for the Percentile-Transfer Prior](#6-data-required-for-the-percentile-transfer-prior)
7. [Historical Data Sources](#7-historical-data-sources)
8. [NEET PG Prediction Flow](#8-neet-pg-prediction-flow)
9. [INI-CET Prediction Flow](#9-ini-cet-prediction-flow)
10. [Exam Pattern Versioning](#10-exam-pattern-versioning)
11. [Rank Range — Not Exact Rank](#11-rank-range--not-exact-rank)
12. [Rank Range → Possible Branches](#12-rank-range--possible-branches)
13. [Output / UI Requirements](#13-output--ui-requirements)
14. [Confidence / Disclaimer](#14-confidence--disclaimer)
15. [Future Outcome Capture System](#15-future-outcome-capture-system)
16. [Future ML Path](#16-future-ml-path)
17. [Data Quality and Validation](#17-data-quality-and-validation)
18. [Phase-by-Phase Implementation Plan](#18-phase-by-phase-implementation-plan)
19. [Implementation Principles](#19-implementation-principles)
20. [Current Status and Next Action](#20-current-status-and-next-action)

---

## 1. Feature Purpose

The Rank & Branch Predictor tells a medical postgraduate aspirant, based on their Grand Test (GT) performance, **where they are likely to land in NEET PG or INI-CET** — an estimated rank range, and the colleges / branches / specialties that rank range has historically corresponded to.

The overall flow:

```
Student selects exam (NEET PG / INI-CET)
        ↓
Student enters GT corrects (any number of Grand Tests — 1 or more)
        ↓
GT performance is aggregated and converted into an
estimated exam-performance / percentile RANGE
        ↓
Estimated percentile is mapped to a predicted AIR / rank RANGE
        ↓
Rank range + category + quota + counselling context
        ↓
Historical counselling data
        ↓
Possible colleges / branches / specialties
```

**This is an ESTIMATE, not a guarantee.** Every output must communicate that it is based on historical data and stated assumptions. The predictor must never present a number as a promised or exact outcome. See [Section 11](#11-rank-range--not-exact-rank) and [Section 14](#14-confidence--disclaimer).

---

## 2. MVP Exams

Only two exams are in scope for the MVP:

1. **NEET PG** (NBEMS)
2. **INI-CET** (AIIMS)

**Out of scope for MVP (do not design around them yet):**

- **FMGE** — pass/fail exam (no ranks, no branch counselling). Would need a pass-probability feature, which is a different product shape.
- **UPSC CMS** — recruitment to posts, not branch counselling. Would need a selection-probability feature.

The architecture must remain **extensible**: exams are configuration + an exam-specific prediction strategy (see [Section 9](#9-ini-cet-prediction-flow) and [Section 19](#19-implementation-principles)), so additional exams can be added later without redesign. But no work for FMGE/UPSC happens in this MVP.

---

## 3. User Input

### 3.1 GT inputs

The student enters their Grand Test performance as **correct counts**, one value per Grand Test:

- GT 1 corrects, GT 2 corrects, GT 3 corrects, … (as many GTs as the student has)

**There is no minimum and no maximum.** The student may enter any number of GTs — 1, 2, 3, 4, 5, or more — and the prediction proceeds with whatever is entered.

**Confirmed product rules (2026-09-19):**

- **No minimum:** even a single GT produces a prediction. A 1-GT prediction must be shown with the widest range and a clear low-data caution (Sections 11 and 14).
- **No maximum:** the student may enter as many GTs as they have; the aggregation (Section 3.3) uses all of them.
- More GTs → more information → a responsibly narrower range. Fewer GTs → wider range. This relationship must be visible to the student.

The architecture should treat "minimum GTs" and "maximum GTs" as configuration (currently: none / unlimited), not hard-coded constants.

### 3.2 Why GT count matters

- A single GT is one noisy measurement — one good or bad day, one favourable/unfavourable topic mix. It is still usable (there is no minimum), but it carries the least information and produces the widest range.
- Averaging repeated measurements reduces noise; this is standard practice for any repeated test. Two GTs are already better than one; three or more, better still.
- More GTs → more information → the prediction range can responsibly be narrower. Fewer GTs → wider range.

### 3.3 Aggregation method

- **MVP:** simple, transparent aggregation — the **mean (average) of the entered GT corrects**, with the individual values retained.
- The average is over however many GTs were entered: 2 GTs → average of those 2; 4 GTs → average of those 4; a single GT → that value itself.
- **One value per GT:** the app's retest workflow allows multiple attempts on the same Grand Test. Aggregation uses one value per GT — **the latest completed attempt, preferring an approved-and-used retest** (dedup rule from the Phase 1 audit; versioned with the method).
- **The individual entered values are always displayed alongside the aggregate**, so the student sees what is driving the prediction. Their spread (consistency) also feeds the range width — see Section 11.
- The mean is the confirmed MVP default, but it is fragile against one anomalous GT (illness, partial attempt). Phase 3 must evaluate robust alternatives (median / trimmed mean) against inspected data and document the choice. Whatever is chosen stays simple and explainable to the student.
- Later, once real outcome data exists, weighting by recency (recent GTs matter more) can be evaluated. Do not build weighting now — there is no data to justify any weighting scheme, and an unjustified weighting is a hidden invention.
- If GTs differ in difficulty or format, percentile-normalizing each GT before averaging is the known best practice. Whether that is needed depends on which GTs students actually enter — decide in [Phase 1](#18-phase-by-phase-implementation-plan) after auditing the GT data model.

### 3.4 Input assumptions (IMPORTANT)

The MVP keeps inputs simple by stating assumptions explicitly instead of collecting more fields. There are three:

**Assumption 1 — No skipped questions.** The predictor assumes the student attempted all questions and skipped none in the entered Grand Tests.

The UI must display this note explicitly:

> "Prediction assumes you attempted all questions and did not skip any questions in these Grand Tests."

Why: the performance input is the **correct count**. If a student skipped questions, the correct count alone understates their performance — we cannot distinguish "got it wrong" from "never attempted it." A later version may add an "attempted / skipped" input per GT to remove the assumption.

**Assumption 2 — Full-length, standard-pattern GTs.** Entered correct counts refer to full-length Grand Tests matching the selected exam's pattern (200 questions for both MVP exams — Section 10). Validation bounds (Section 3.5) enforce the ceiling; this assumption covers format.

**Assumption 3 — Difficulty parity (methodology assumption, NOT a user input).** GTs are treated as comparable to the actual exam in difficulty and positioning: a given level of GT performance is assumed to sit at a similar relative standing in the exam population. This is the core assumption of the Percentile-Transfer Prior (Section 5). It may be wrong for any individual GT, and it is **not** corrected by asking students for a difficulty rating in the MVP — per-GT difficulty adjustment is a future calibration step once outcome data exists (Sections 15–16). It is communicated in the methodology note on results (Section 13).

### 3.5 Input validation

| Rule | Behaviour |
|---|---|
| GT count | No minimum, no maximum — 1 or more GT values; the prediction proceeds with any count |
| Numeric only | Non-numeric / empty inputs rejected |
| Integer | Correct counts are whole numbers |
| Lower bound | ≥ 0 (no negatives) |
| Upper bound | ≤ total questions of the selected GT/exam pattern (200 for both MVP exams' standard patterns — see [Section 10](#10-exam-pattern-versioning)) |
| Impossible values | Values outside the bound are rejected with a clear message, not silently clamped |
| Consistency | All entered GTs must belong to the selected exam |

### 3.6 Category and quota inputs

Branch prediction depends on category and quota; these must be collected from the student:

- **Category (required for branch results):** UR / EWS / OBC / SC / ST, plus PwD status where the counselling data supports it. Historical closing ranks differ 2–10× by category (Section 6C) — a missing or silently-defaulted category misleads every reserved-category student, so **there is no default**.
- **Quota:** NEET PG requires a quota context; **MVP covers AIQ only, displayed explicitly as "All India Quota"** (state/deemed/central/DNB quotas are future expansion — Section 7). INI-CET is a single counselling pool — no quota input.
- **Rank-range prediction itself does not need category** (AIR is category-agnostic); category is required from the branch stage onward. The UI may collect it with the initial inputs or just before branch results — an implementation decision, as long as it is never defaulted.

Validation: category must be one of the supported enum values; no branch prediction without it.

---

## 4. Critical Data Limitation

**This is the central constraint of the whole feature and must be understood by everyone working on it.**

Eyeconic Mentorship is not yet live. We therefore do **NOT** have a sufficiently large historical Eyeconic dataset that contains, for the **same student**:

```
GT corrects → actual exam score → actual exam percentile → actual AIR
```

Consequences:

- We **cannot** train a reliable supervised model from GT corrects → actual exam score/rank. There are no labels.
- We must **not** claim we can.
- We must **not** create a fake or synthetic "training dataset."
- We must **not** pretend public GT data and public exam-result data are paired observations for the same students, unless a source explicitly proves that relationship. (No such source is currently known. Crowd-sourced GT→AIR compilations, e.g. YouTube videos, are not individual-level ground truth.)

The MVP therefore works as a **transparent statistical estimate** (Section 5), and the system is designed to **earn** the missing dataset over time via outcome capture (Section 15). This is a feature, not a workaround: the honest path is also the defensible one.

---

## 5. MVP Approach — Percentile-Transfer Prior

*(One of the main sections of this document.)*

### 5.1 The idea in simple language

We do not know the exact relationship "GT corrects → actual exam score" for Eyeconic students — nobody has that data for our cohort. What we *do* have is reliable historical data about **where performance levels sit inside the exam population** (percentiles and ranks from official results, and counselling cutoffs).

So instead of predicting a score directly, we:

1. Take the student's aggregated GT performance.
2. Place it on a **normalized performance scale** (e.g. fraction of questions correct; GT-cohort percentile if Eyeconic GT cohort statistics exist by then).
3. **Transfer** that standing to the exam: a student at roughly performance level X in GTs is estimated to sit around a similar relative standing (percentile) in the exam population — expressed as a **range**, not a point.
4. Resolve that estimated exam-percentile range through the historical exam distribution into a **predicted AIR range**.
5. Resolve the AIR range through historical counselling cutoffs into **possible branches/colleges**.

```
GT corrects
        ↓
GT performance level / normalized performance
        ↓
Estimated exam percentile RANGE          ← the "transfer" step (the bridge)
        ↓
Historical percentile ↔ rank relationship (official data)
        ↓
Predicted AIR / rank RANGE
```

The percentile-transfer step is **the bridge that lets the MVP work without paired Eyeconic GT→outcome data**.

### 5.2 Honest framing — what this method is and is not

The document and the product must say clearly:

- It is an **MVP methodology** — a prior/estimate, not a directly trained student-level model.
- It **relies on explicit assumptions** — the three input assumptions of Section 3.4 (no skipped questions; full-length standard-pattern GTs; difficulty parity) plus honest self-reporting of correct counts.
- It must be **validated against whatever historical evidence is available** (official distributions, category cutoff anchors, and — as secondary reference — crowd-sourced GT→AIR compilations).
- Predictions are always expressed as **ranges**.
- It must be **recalibrated when real Eyeconic outcome data becomes available** (Sections 15–16).

Do **not** claim the percentile-transfer step is "accurate" because it is statistically convenient. Its error is unknown until outcome data exists; the range width and disclaimers exist precisely because of that.

### 5.3 Exact formula: deliberately not fixed here

The exact mathematical mapping (how GT corrects map to a normalized level, how that level maps to a percentile range, and how wide the range is) must be **finalized only after inspecting and validating the actual datasets** in [Phase 0–2](#18-phase-by-phase-implementation-plan). This specification intentionally does not hard-code an arbitrary formula. Any numbers chosen at implementation time must be traceable to an inspected dataset and recorded in the method-version log (Phase 9).

### 5.4 GT → exam conversion: fallback ladder

The normalize → percentile step runs in one of two modes, with a defined fallback. Which mode produced a prediction is part of the stored method version (Phase 9).

| Tier | Mode | Precondition | Notes |
|---|---|---|---|
| **Tier 1 — fraction-correct parity** (always available; launch default) | Normalized GT performance = corrects ÷ total questions, mapped onto the exam population via the official distribution under the difficulty-parity assumption (Section 3.4, Assumption 3) | None | The only mode that works while Eyeconic cohort data is absent or tiny. Produces the widest ranges. |
| **Tier 2 — GT-cohort percentile transfer** | The student's percentile within the Eyeconic attempt cohort for that specific GT → exam percentile → rank via the official distribution | **Per-GT minimum cohort size** — threshold set and documented at Phase 2/3, configurable. Below the threshold the GT falls back to Tier 1 | Statistically better (transfers relative standing instead of assuming parity) but meaningless on small cohorts — 40 attempts do not make a percentile. |
| **Tier 3 — crowd-sourced anchors** (cross-check only, never primary) | Sanity-check Tier 1/2 outputs against labelled priors: Hazra INI-CET corrects→AIR ladders, third-party marks-vs-rank tables | Always allowed as cross-check | Never merged into the mapping as ground truth (Section 7). |

Rules:

- The engine selects the tier per GT automatically from data availability, and the response records which tier(s) were used.
- Tier 2's cohort threshold is a documented, configurable number — not a judgement call in code. Set during Phase 2/3 from inspected cohort sizes, recorded in the method-version log.
- A single prediction may mix tiers (some GTs on Tier 2, others falling back to Tier 1); this is acceptable and must be recorded.

---

## 6. Data Required for the Percentile-Transfer Prior

Three categories of data are required. Each imported record must retain provenance (Section 17).

### A. GT-side data (what the student did)

| Field | Why needed |
|---|---|
| GT correct count | The performance input |
| Total questions / max possible corrects | Normalization — 140/200 ≠ 140/300 |
| GT exam/test type & identity | GTs differ; needed to compare like with like and for later difficulty normalization |
| GT date (if available) | Enables later recency weighting; MVP stores it if cheap |
| Selected exam (NEET PG / INI-CET) | Segregation of prediction strategies |
| Whether the student skipped questions | Known limitation — MVP assumes no skips and displays the note (Section 3.4); capture this field when it becomes available |
| Input provenance (auto-captured vs self-reported) | Quality signal — GTs taken inside Eyeconic can be auto-filled from attempt records; manually entered values are tagged self-reported. Stored per input; enables later calibration weighting and audits |

MVP reality: the user enters corrects; we display the no-skip assumption. Everything else in this table is captured automatically where the GT is taken inside Eyeconic.

### B. Historical exam data (performance → rank)

| Field | Why needed |
|---|---|
| Exam + year/session | Distributions shift yearly; INI-CET runs two sessions/year |
| Score (where available) | The performance ↔ rank bridge for NEET PG |
| Percentile | Year-normalized scale; the only continuous scale INI-CET publishes |
| AIR / rank | The core key linking performance to branches |
| Number of candidates | Converts ranks to percentiles and vice versa; sanity checks |
| Exam pattern/version (total Qs, marking, max marks) | Prevents cross-pattern mixing (Section 10) |
| Source, source type, source URL, data coverage/year | Provenance and trust labelling (Section 17) |

Percentile definitions must be pinned per exam before implementation: use the official definition where the exam body publishes one, and derive from rank ÷ candidate count only where it does not — never mix the two silently across years or sources.

### C. Counselling data (rank → branch)

| Field | Why needed |
|---|---|
| Exam | NEET PG and INI-CET counselling are separate universes |
| Counselling year | Cutoffs drift year to year; never mix silently |
| Counselling round | Closing ranks drift R1 → R3/mop-up |
| Category (UR/OBC/SC/ST/EWS, PwD) | Closing ranks differ 2–10× by category; a UR-only view misleads reserved-category students |
| Quota (AIQ / state / deemed / central / DNB) | Allotment pools are separate with different cutoffs |
| Institute/college | College-level output |
| Branch/specialty | The prediction target |
| Opening rank (where available) | Display context only |
| Closing rank | **The** threshold value for branch possibility |
| Source, source URL | Provenance |

---

## 7. Historical Data Sources

From the completed research (`rank-predictor-data-research.html`, 2026-09-18). Sources are listed in priority order: **official first**. Do not invent additional datasets; anything not listed here and not yet verified must be marked **needs verification**.

### 7.1 Official sources (primary)

| # | Source | Exam | Years | Contains | Supports | Type | Location | Limitations |
|---|---|---|---|---|---|---|---|---|
| 1 | **NBEMS "Notice Board Result" PDF (NEET PG 2025)** | NEET PG | 2025 | All 242,493 candidates: Total Score /800 + Rank | Score ↔ rank mapping (the complete empirical distribution — a lookup, not a model) | **Official** | `natboard.edu.in/natboard-data/pdf/NEETPG2025RESULT/NEET-PG 2025 Notice Board Result - 19.08.2025 - DS.pdf` (direct download works despite site's Turnstile gate — verified) | One year; 2021–2024 equivalents exist but sit behind tokenized URLs (browser/Wayback retrieval needed) |
| 2 | **NBEMS category cutoff notices** | NEET PG | per year | Category-wise qualifying scores | Anchor points to sanity-check the score↔rank curve | **Official** | natboard.edu.in notices | Point values only, not distributions |
| 3 | **MCC counselling allotment PDFs** | NEET PG | 2020–2025 | Per-round: AIR, quota, institute, course, allotted category, candidate category, remarks | Rank → branch (derive closing ranks by aggregation; no marks, no precomputed cutoffs) | **Official** | `mcc.nic.in/archive-pg/` (archive; current cycle at `/pg-medical/`); PDFs on `cdnbbsr.s3waas.gov.in` | Text-extractable but large; 2019 and earlier not on MCC's estate (Wayback only); state quotas live on separate state sites |
| 4 | **AIIMS INI-CET result PDFs** | INI-CET | 2021–2026 (per session) | All qualified candidates: Roll, Category, PwBD, Overall Rank, Percentile — **no marks, ever** | Percentile ↔ rank mapping (official) | **Official** | `docs.aiimsexams.ac.in` serves PDFs directly (verified); filename enumeration via Wayback CDX | **No marks published** — score-based prediction impossible from official data alone |
| 5 | **AIIMS INI-CET counselling round PDFs** | INI-CET | Jan 2021 – Jul 2026 | Per round: Roll, Overall Rank, Category, PwBD, Allotted Specialty, Allotted Institute, Roster point | Rank → branch for all INIs (AIIMS, JIPMER, PGIMER, NIMHANS, SCTIMST) | **Official** | Same docs host; verified live for Jan 2022/2023/2025, Jul 2025 | Closing ranks must be derived by aggregation |

### 7.2 Reliable structured public datasets (secondary, official-derived)

| # | Source | Exam | Years | Contains | Supports | Type | Location | Limitations |
|---|---|---|---|---|---|---|---|---|
| 6 | **github.com/crockzo/neet-pg** | NEET PG | 2025 | ~66,000 rows, rounds R1–R3: rank, score, quota, institute, state, course, allotted/candidate category, remarks | Rank → branch **and** a cross-check for score↔rank; single best day-one asset | Public mirror (MCC/NBEMS-derived) | Direct raw download, no login | No explicit license — unofficial republication of public records (fine for internal use; add attribution); single year |
| 7 | **github.com/rahuldathu/NEET-PG-College-Predictor-2025** | NEET PG | 2024 | Six CSVs (~38 MB): rank, quota, institute, course, category, round, remarks + final allocation | Rank → branch, year two of the cutoff table | Public mirror | Direct download | No score column; same license note |
| 8 | **github.com/SaranDS/NEET_PG-TN-2025-Allotment-Chat-Summary-** | NEET PG (Tamil Nadu state quota) | 2025–26 | SQLite: score, rank, community, allotted college/department | Template for later state-quota expansion | Public mirror | Direct download | One state only — out of MVP scope (AIQ first) |

### 7.3 Other secondary / cross-check sources

| # | Source | Use | Status |
|---|---|---|---|
| 9 | **Sartha.in cutoff database** (2024–25) | Cross-check of derived closing ranks (explicitly MCC-derived tables) | Secondary — cross-check only, never merged as ground truth |
| 10 | **Careers360 / Shiksha marks-vs-rank tables** | Cross-checks only; crowd-sourced, non-monotonic | Secondary — do not use in the mapping |
| 11 | **GetMyUni** | None — recycles a 2022 table as 2024 | Avoid |
| 12 | **Kaggle "neet-pg-2019-score-rank-data"** (~38 MB) | Potential extra pre-scale-break year | **Needs verification** (login required to inspect columns) |
| 13 | **Dr Mayukh Hazra YouTube channel** | See 7.4 | Secondary/reference only |

### 7.4 Mayukh Hazra videos — secondary reference ONLY

- Crowd-sourced "GT corrects vs AIR" compilations (his own statement); **not individual-level ground truth**; UR-only; coverage starts 2024; automated transcripts of his videos are numerically corrupt (research verified).
- **He is NOT a primary data source.** The project must NOT depend on manually extracting years of YouTube videos.
- Permitted use: (a) a handful of INI-CET "corrects vs AIR" ladder videos as a **labelled prior/cross-check** — the only marks-ish INI-CET signal that exists anywhere; (b) sanity-checking NEET PG GT→rank intuition. Any value taken from these videos must be tagged with its provenance and displayed as a crowd-sourced estimate.

### 7.5 Source-priority rules

1. Official government/exam authorities (NBEMS, AIIMS) and official counselling authorities (MCC) are ground truth.
2. Reliable structured public mirrors (7.2) accelerate ingestion of the same official data — verify a sample against the official PDFs before trusting a mirror.
3. Other secondary sources: cross-checks only, never merged into the primary mapping.
4. Anything unverified is marked **needs verification** and blocked from production use until verified.

---

## 8. NEET PG Prediction Flow

Exam-specific flow, MVP:

```
User selects NEET PG · enters 1+ GT correct counts · selects category (Section 3.6)
        ↓
Validate inputs (Section 3.5; 0–200 corrects each, any count ≥ 1)
        ↓
Aggregate GT performance (mean of corrects, MVP)
        ↓
Normalize / interpret GT performance
        (Tier 1 / Tier 2 fallback ladder — Section 5.4)
        ↓
Estimate exam percentile / performance RANGE
        (Percentile-Transfer Prior — Section 5)
        ↓
Map through historical score ↔ percentile ↔ rank relationship
        (official NBEMS distribution; per-year anchor)
        ↓
Produce predicted AIR RANGE
        ↓
Match against historical counselling cutoffs
        (category + quota + year + round filters)
        ↓
Return possible branches / colleges
```

Notes:

- The exact math of the normalize → percentile-range → rank steps is finalized in Phases 2–4 **after dataset inspection** (Section 5.3). Do not hard-code an arbitrary formula now.
- The normalize step runs the Tier 1 / Tier 2 fallback ladder of Section 5.4; the tier used is recorded with the prediction.
- Validation of the mapping uses **consistency and sanity checks** — monotonicity of the mapping, agreement with official category-cutoff anchors, cross-source agreement (mirror vs official PDF) — not "backtesting". True backtesting needs paired GT↔outcome data, which does not exist (Section 4) and must not be implied.
- Handle the score-scale change with **per-year anchors** (Section 10): each year's distribution is used only with its own pattern version.
- Output always includes data-coverage year(s) and the methodology/limitation notes (Section 13).

---

## 9. INI-CET Prediction Flow

INI-CET is a priority MVP exam, but **its data structure is not identical to NEET PG's** — most importantly, **AIIMS has never published INI-CET marks** (official result PDFs carry rank + percentile only). Do **not** assume the NEET PG score↔rank relationship transfers.

MVP flow:

```
User enters 1+ GT correct counts (INI-CET selected)
        ↓
Validate inputs (0–200 corrects each, any count ≥ 1)
        ↓
Aggregate GT performance (mean of corrects, MVP)
        ↓
Predicted PERCENTILE RANGE
        (Percentile-Transfer Prior; crowd-sourced corrects→AIR
         ladders — Hazra — usable only as labelled priors here,
         because no official marks exist)
        ↓
Predicted RANK RANGE
        (official AIIMS percentile ↔ rank distribution)
        ↓
Branch/college mapping
        (official AIIMS counselling allotments: closing ranks
         by institute × specialty × category × round)
```

Consequences for design:

- INI-CET's weakest link is the corrects→percentile step (no official ground truth); its percentile→rank and rank→branch steps are fully official. The UI must say so (Section 13).
- **The architecture must implement an exam-specific prediction strategy** — a common interface (validate → aggregate → estimate percentile range → resolve rank range → resolve branches) with per-exam configuration and per-exam data adapters, not one hard-coded NEET PG pipeline with INI-CET bolted on.
- **Category limitation:** the crowd-sourced corrects→percentile priors (Hazra ladders, Section 7.4) are **UR-only**. For reserved categories the INI-CET estimate is weaker still, and the result's methodology note must say so (Section 13). The official percentile↔rank and allotment stages are category-complete.

---

## 10. Exam Pattern Versioning

Exam patterns change; the data must never silently mix patterns.

Every historical exam record and every prediction context must retain:

- exam (NEET PG / INI-CET / future)
- year (and session for INI-CET)
- exam pattern/version identifier
- total questions
- scoring structure where known (marking scheme)
- maximum marks where relevant

Known pattern facts (as of research date):

| Exam | Pattern | Notes |
|---|---|---|
| NEET PG (through 2025) | 200 questions, +4 / −1, max 800 | **The MVP target — this is the pattern our historical data covers** |
| NEET PG (2026) | Portal-reported change to a 720 scale | **Needs verification.** Do NOT redesign the MVP around it; handle later via a new pattern version + fresh anchors |
| INI-CET | 200 questions, +1 / −⅓, max 200 | Stable pattern across available data |

MVP rule: **target the previous (800-scale) NEET PG pattern**, because that is what the historical data is. When a new pattern stabilizes and its data exists, add it as a new pattern version with its own distributions — the architecture makes this a data/config change, not a rewrite.

---

## 11. Rank Range — Not Exact Rank

The system outputs ranges:

> ✅ "Estimated AIR: 10,500 – 14,500"
>
> ❌ "Your AIR will be 12,431."

Why:

- Historical distributions vary year to year.
- GT performance does not perfectly translate to actual exam performance (no paired data — Section 4).
- The MVP methodology is a prior with assumptions (Section 5), and its error is unknown until outcome data accrues.
- Counselling rank↔branch relationships shift by year, round, and seat matrix.

Range width must communicate uncertainty honestly. Design guidance:

- Range width is a function of (at least) **how many GTs were entered and how consistent they are** — 1 GT produces the widest range; each additional GT narrows it toward a floor; and a tight cluster of GTs (120 / 122 / 121) yields a narrower range than a scattered set with the same mean (90 / 140 / 115). GT dispersion is available at prediction time and needs no historical data to justify using it. Exact widths are set during calibration against inspected data (Phase 4/5), not invented here.
- A 1-GT prediction must never be displayed with the same visual confidence as a multi-GT prediction.

---

## 12. Rank Range → Possible Branches

Second half of the feature.

Inputs:

- predicted rank range
- exam
- category (UR/OBC/SC/ST/EWS, PwD)
- quota (AIQ first for NEET PG; INI-CET is a single pool)
- counselling year(s)
- counselling round convention (e.g. last round, or round-wise display)

Flow:

```
Historical counselling cutoff data (closing ranks per
institute × branch × category × quota × year × round)
        ↓
Find branches whose historical closing ranks overlap
or sit sensibly relative to the predicted rank range
        ↓
Display possible colleges / branches
```

Each result row shows:

- College / institute
- Branch / specialty
- Historical closing rank
- Year
- Round
- Category
- Quota

Presentation guidance: group results as historical possibility, e.g. bands ("historically within range" / "borderline" / "aspirational"), rather than a flat ranked list. Exact banding is an implementation decision validated against the data (Phase 6).

**This is based on HISTORICAL CUT-OFFS and is not a guarantee of allotment.** Cutoffs move every year with seat matrices, candidate behaviour, and exam difficulty; the UI must state this next to the results.

### Extreme ranges / empty states

The predicted rank range can fall entirely outside the imported historical cutoffs. Never show a blank or silently empty result — define explicit states:

- **Better than every recorded closing rank:** message that the estimated range sits at or above the top of the historical admissions data, stating the years/rounds covered.
- **Worse than the last closing rank in the data:** honest message that the estimated range is beyond the last historically allotted rank in the covered years/rounds — framed constructively (the range reflects current GT performance, not fate).
- **Partial overlap:** show the overlapping portion, clearly labelled as partial.

Every state names the data coverage it was computed against.

---

## 13. Output / UI Requirements

### Exam selector
- NEET PG (priority), INI-CET (priority). Extensible list.

### Category & quota selector
- Category (UR / EWS / OBC / SC / ST; PwD where the data supports it) — required before branch results; **never defaulted** (Section 3.6).
- NEET PG: quota displayed explicitly as "All India Quota" (MVP scope).
- INI-CET: no quota selector (single counselling pool).

### GT input section
- A dynamic list of GT correct entries: starts with one row, student adds as many as they have (add / remove rows).
- No minimum and no maximum; 1 GT is enough to run a prediction, and more GTs are always accepted.
- Low-count guidance: when few GTs (e.g. 1–2) are entered, show the soft note from Section 14 — never block.
- **Auto-fill from Eyeconic where available:** GTs taken in the app are pre-filled from attempt records (corrects + total + date) for the student to confirm; manually added entries are tagged **self-reported**. The student can see which is which (input provenance, Section 6A).
- Validation per Sections 3.5–3.6.

### Assumption note (always visible with the input)
> "Prediction assumes you attempted all questions and did not skip any questions in these Grand Tests."

The difficulty-parity and full-length-GT assumptions (Section 3.4) are communicated in the methodology note on the result, keeping the input screen uncluttered.

### Prediction result — NEET PG
- Estimated percentile / performance range
- Predicted AIR range
- Aggregation summary: the individual GT values, the aggregate used, and input provenance (auto-captured vs self-reported)
- Data/source year or coverage (e.g. "based on NEET PG 2025 official results + 2024–25 counselling data")
- Short methodology note (one or two lines, plain language — mentions the difficulty-parity assumption and the transfer tier used, Sections 3.4 and 5.4)
- Confidence / data-limitation note (Section 14)

### Prediction result — INI-CET
- Estimated percentile range
- Predicted rank range
- Data/source year or coverage (e.g. "rank mapping: official AIIMS results 2025 sessions; corrects→percentile step is a crowd-sourced estimate")
- Methodology note — must state that the corrects→percentile step has no official ground truth and that its crowd-sourced priors are UR-only (weaker for reserved categories, Section 9)
- Confidence / data-limitation note

### Branch results (where applicable)
- College, branch, historical closing rank, year, round, category/quota context
- "Historical possibility, not a guarantee" framing
- No blank results for out-of-range predictions — the extreme-range states of Section 12 with their data coverage

### General UI rules
- Never display a bare point prediction anywhere.
- Show data coverage/provenance next to the numbers ("source year" chips), not buried in a tooltip.
- Auto-captured and self-reported GT entries are visually distinguishable.

---

## 14. Confidence / Disclaimer

**Do not fabricate confidence percentages.** No "87% confident" unless a statistically defensible methodology exists (it does not, pre-outcome-data).

Use plain language:

> "Estimate based on historical data. Actual exam performance and counselling outcomes may vary."

If data coverage is weak for a given exam/step, say so explicitly (e.g. INI-CET corrects→percentile step).

There is no minimum GT count, so nothing blocks — but when only 1–2 GTs are entered, show a soft, non-blocking note:

> "Based on few Grand Tests. Add more GTs for a narrower, more reliable estimate."

Disclaimers must be visible with the results, not only on a separate page.

---

## 15. Future Outcome Capture System

*(Live — 10a shipped the minimal consent-based capture form with M1 so no result window was missed; 10b (M2, 2026-09-20) completed it with the counselling outcome + allotted branch and the evaluation-dataset assembly — see `RANK_PREDICTOR_PHASE10B_REPORT.md`.)*

Once Eyeconic is live, capture for each willing student:

**Before the exam (mostly automatic):**
- GT corrects and GT performance details (Section 6A)
- Predicted percentile (as predicted at that time)
- Predicted rank range

**After the actual exam (voluntary self-report + later automation where possible):**
- Actual exam score (where published/known)
- Actual percentile
- Actual AIR
- Counselling outcome where available
- Actual allotted college/branch, if voluntarily provided

**Capture quality and participation (design requirements):**

- **Timing:** ask for outcomes around result/counselling declaration windows, when recall and motivation are highest — not on an arbitrary schedule.
- **Consent & privacy:** submission is voluntary and consent-based, consistent with the app's privacy policy; store the minimum required (score/percentile/rank + counselling outcome), nothing speculative.
- **Linkage:** every outcome links back to the stored prediction (method + dataset snapshot versions, Phase 9) and the GT history that produced it — that link is what makes the pair usable for calibration (Phases 10–11).

This creates the missing dataset:

```
GT performance → actual exam outcome        (paired, same student)
```

With it, Eyeconic can measure prediction error, recalibrate ranges, and eventually justify (or reject) ML approaches. Every prediction stored now (Phase 9) is a future evaluation sample — which is why prediction history with method versioning is part of the MVP build.

---

## 16. Future ML Path

**ML is NOT the MVP.** The staged path:

| Phase | What | Gate to proceed |
|---|---|---|
| 1 | Historical/statistical prior (this MVP) | — |
| 2 | Outcome capture (Section 15) | MVP live |
| 3 | Calibration — measure prediction error against captured outcomes; adjust the prior and range widths | Enough paired outcomes to compute meaningful error stats (order of ~100+ before any fitting is worth discussing) |
| 4 | Paired Eyeconic dataset accumulation | Ongoing capture across 1–2 exam cycles |
| 5 | Evaluate ML models — only if the collected data justifies it | Real paired labels exist; simple models evaluated before anything complex |

No neural networks, no complex ML, no synthetic labels — ever, unless earned by real data.

---

## 17. Data Quality and Validation

Every historical dataset, before it may feed predictions, must be validated for:

- duplicate records
- incorrect ranks (non-monotonic score↔rank, out-of-range values)
- missing values
- inconsistent branch/specialty names (same branch, different spellings)
- inconsistent college/institute names
- category naming differences (UR/Gen/General, etc.)
- quota naming differences
- counselling round differences (round naming/merging conventions)
- exam year and session correctness
- exam pattern/version consistency (Section 10 — never mix patterns unnormalized)
- source provenance completeness

**Provenance is mandatory:** every imported historical record retains its source name, source type (official / mirror / secondary / crowd-sourced), source URL, and import date. Prediction outputs cite their data coverage. Records without provenance do not enter the prediction dataset.

Mirror datasets (7.2) must be sample-verified against their official PDFs before use. Crowd-sourced values are tagged as such end-to-end.

---

## 18. Phase-by-Phase Implementation Plan

Each phase lists: objective, what gets built, dependencies, what must NOT be done yet, completion criteria.

### Milestone packaging (build order)

Phases execute as two milestones so a working NEET PG predictor ships first and INI-CET (the weaker-data exam, Section 9) does not block it:

| Milestone | Contents | Outcome |
|---|---|---|
| **M1 — NEET PG vertical slice** | Phase 0 (timeboxed) → Phase 1 (parallel) → Phase 2 (NEET PG data) → Phase 3 → Phase 4 → Phase 6 (NEET PG branch matching) → Phase 7 (API **with prediction persistence — Phase 9 built here**) → Phase 8 (NEET PG UI, legacy page retired) → Phase 10a (minimal outcome-capture form) | Launchable NEET PG predictor |
| **M2 — INI-CET + completeness** | AIIMS source enumeration + INI-CET ingestion (Phase 2 extension) → Phase 5 → Phase 6 INI-CET portion → INI-CET UI → Phase 10b (full outcome capture) | Both exams live |

Sequencing rules:

- Phase 6's **NEET PG portion depends only on Phase 4 — not on Phase 5**. Phase numbering stays stable for cross-references; milestones, not numbers, define execution order.
- **Phase 9 (prediction history) is built inside Phase 7.** No prediction may be served before persistence exists — an unpersisted prediction is a calibration sample lost forever.
- **Phase 10 splits:** 10a minimal consent-based form with M1; 10b full capture in M2. Result windows are externally scheduled (INI-CET Jan/Jul sessions; NEET PG mid-year) — if the form misses a result window, the next calibration cohort is months away.

**Accuracy expectations for this plan:** the score→rank and rank→branch stages are exact lookups over official data — their accuracy is a correctness property, tested by reproduction (Phases 4 and 6). The only genuinely estimable stage is the GT→percentile transfer (Section 5), which cannot be validated until outcome data exists. Ranges therefore stay wide until Phase 11 calibration, and no product or launch pressure narrows them.

**Rough timeline (single developer):** M1 ≈ 2.5–3.5 weeks; M2 ≈ 2 further weeks. Estimates, not commitments.

### Phase 0 — Documentation & data-source verification (M1 — timeboxed)
- **Objective:** Freeze the spec; turn "researched" sources into verified, catalogued assets — only as far as M1 needs.
- **Build (timeboxed to M1 scope):** Finalize this document; verify the three M1-critical sources — NBEMS 2025 Notice-Board PDF (spot-check sample rows, not a full parse), crockzo 2025, rahuldathu 2024; record provenance for each; a source catalogue noting variables, coverage, and quality; identify missing variables. AIIMS/INI-CET enumeration is catalogued as "needs verification" and executed in M2.
- **Dependencies:** None.
- **Not yet:** No schema, no app code, no prediction logic. **No work on the 2026 pattern/scale question** — the MVP intentionally targets the previous 800-scale pattern (decided; Section 10); re-anchoring is deliberately deferred and is not a Phase 0 task.
- **Done when:** The three M1 sources are verified (sample row counts / spot checks against the official PDFs), and every other Section 7 source is catalogued "needs verification" with its milestone assigned.

### Phase 1 — Existing Eyeconic data audit (M1 — runs in parallel with Phase 0)
- **Objective:** Know exactly what GT data exists today.
- **Build:** Audit of the mentorship app + website: GT/test models, GT result APIs, user identity linkage, which Section 6A fields are already captured (corrects, totals, dates, attempt logs), and whether GT-cohort statistics can be computed.
- **Dependencies:** Phase 0 (no technical dependency; can run in parallel).
- **Not yet:** No new collections/migrations — read-only audit.
- **Done when:** A written inventory answers: can we retrieve, per student, their GT corrects + totals + dates? Are there enough attempts for cohort percentiles?

### Phase 2 — Historical data ingestion foundation (M1 = NEET PG data; INI-CET ingestion in M2)
- **Objective:** A normalized, provenance-tagged historical store.
- **Build:** Normalized schemas for exam distributions (Section 6B) and counselling cutoffs (Section 6C); **mirror-first ingestion** — crockzo/rahuldathu are the primary M1 ingestion path, sample-verified against the official PDFs (full official-PDF ETL is not an M1 requirement); **canonical branch/specialty and institute name dictionaries with a fuzzy-match review step** — name variants fail silently by dropping branches from results, so this is where ingestion mistakes hide; validation/normalization pipeline (Section 17) including a **post-ingestion sanity suite** (monotonic score→rank, rank counts ≤ candidate counts, cutoff ordering within category); **golden-file tests** pinning known official rows so re-ingestion cannot silently regress; provenance stored on every record.
- **Dependencies:** Phase 0 (verified sources), Phase 1 (GT field mapping).
- **Not yet:** No prediction logic; no UI. INI-CET ingestion is not an M1 blocker.
- **Done when:** NEET PG 2025 distribution + 2024/2025 counselling cutoffs are imported, validated (sanity suite green, golden files pass), and queryable with provenance. INI-CET sessions' rank/percentile + allotments reach the same bar in M2.

### Phase 3 — Prediction engine foundation (M1)
- **Objective:** The engine skeleton with exam-specific strategies.
- **Build:** Exam-strategy interface (validate → aggregate → estimate percentile range → resolve rank range → resolve branches); GT input validation (Sections 3.5–3.6); GT aggregation (mean as confirmed default; evaluate robust alternatives — median / trimmed mean — against inspected data and document the choice); the Percentile-Transfer Prior module with the Tier 1/Tier 2 fallback ladder and the cohort-size threshold (Section 5.4; values finalized here from inspected data).
- **Dependencies:** Phase 2.
- **Not yet:** No API exposure, no frontend; no ML.
- **Done when:** Given test inputs, the engine produces a defensible **NEET PG** percentile range with unit tests, and records which transfer tier produced it (M1). The INI-CET strategy is scaffolded by the interface but implemented in Phase 5 (M2).

### Phase 4 — NEET PG rank prediction (M1)
- **Objective:** Percentile range → AIR range via official data.
- **Build:** Score/percentile ↔ rank mapping on the imported official distribution (per-year anchors, 800-scale MVP); AIR range output; **validation and sanity checks** — monotonicity of the mapping, agreement with official category-cutoff anchors, cross-source agreement (mirror vs official PDF). True backtesting is impossible without paired GT↔outcome data (Section 4) and is not claimed; documented limitations.
- **Dependencies:** Phase 3.
- **Not yet:** No branch matching (next phase); no recalibration claims.
- **Done when:** AIR ranges are produced; monotonicity checks pass; **100% of a spot-check sample of official score→rank pairs reproduce exactly** — this stage is a lookup over official data, so any mismatch is an ingestion bug, not a tolerance question; official category-cutoff anchors agree.

### Phase 5 — INI-CET prediction (**✅ shipped 2026-09-20 — see `RANK_PREDICTOR_PHASE5_REPORT.md`**; strategy complete, availability flips with Phase 6 + UI)
- **Objective:** Corrects → percentile range → rank range for INI-CET.
- **Build:** INI-CET strategy: corrects→percentile prior (Hazra ladders as labelled priors where used — UR-only, flagged for reserved categories), official percentile↔rank resolution; consistency checks against historical sessions (no paired GT data exists — Section 4).
- **Dependencies:** Phase 3; Phase 2 INI-CET data.
- **Not yet:** Do not treat crowd-sourced priors as ground truth; no invention of INI-CET marks data.
- **Done when:** Rank ranges produced for INI-CET with the weaker step clearly flagged in output metadata.

### Phase 6 — Branch/college prediction (M1 = NEET PG portion ✅ · M2 = INI-CET ✅ 2026-09-20, see `RANK_PREDICTOR_PHASE6_INICET_REPORT.md` — recall 125/125)
- **Objective:** Rank range → possible branches/colleges.
- **Build:** Cutoff matching over imported counselling data; category/quota/round filters; possibility banding; result rows per Section 12.
- **Dependencies:** NEET PG portion — Phase 4 only (M1); INI-CET portion — Phase 5 (M2); Phase 2 counselling data per exam.
- **Not yet:** No guarantee language; no state-quota expansion (AIQ/INI first).
- **Done when:** For **~50 sampled historical allotments** (rank + category + quota rows drawn from the imported data, e.g. crockzo rows), the actually allotted branch appears among the predicted possibilities for that rank — and results carry year/round/category context.

### Phase 7 — Backend API (M1 — includes prediction persistence)
- **Objective:** Expose the engine safely — with every prediction persisted as it is served.
- **Build:** Prediction endpoints (predict, retrieve student's GTs for auto-fill — tagged auto-captured vs self-reported); request validation; authentication; prediction response contract (ranges, data coverage, methodology + limitation notes, method version + dataset snapshot version, transfer tier, input provenance); **prediction persistence built here, not later** — Phase 9's storage requirements are part of this phase's "done", because an unpersisted prediction is a calibration sample lost forever.
- **Dependencies:** Phase 4 + Phase 6 (NEET PG portion).
- **Not yet:** No outcome-capture endpoints (Phase 10); no INI-CET endpoints until Phase 5.
- **Done when:** Endpoints work with auth, validation, and complete response metadata — and no prediction can be served without being stored and retrievable (Phase 9 done-when holds).

### Phase 8 — Frontend (M1 = NEET PG UI; INI-CET UI lands with Phase 5 in M2)
- **Objective:** The student-facing feature per Section 13.
- **Build:** Exam selection; category & quota selectors (Section 3.6); GT input (dynamic list, any count ≥ 1, no cap) with validation and auto-fill from Eyeconic attempts where available; assumption notes (no-skip visible at input; difficulty parity in the methodology note); prediction result display (ranges + coverage + notes, width scaling with GT count and dispersion, aggregation summary with provenance); branch results with extreme-range/empty-state handling; disclaimers; **retire/redirect the legacy `GtPredictor.tsx` page so only one predictor is ever live**.
- **Dependencies:** Phase 7.
- **Not yet:** No fake precision UI; no confidence percentages. M1 covers NEET PG only — the INI-CET option is disabled/hidden until Phase 5 lands.
- **Done when:** A student can complete the full flow, every screen meets Section 13/14 requirements, and the legacy GtPredictor page no longer offers a second, conflicting prediction.

### Phase 9 — Prediction history (built within Phase 7 — requirements listed here)
- **Objective:** Every prediction stored for future evaluation — from the very first served prediction, not after launch.
- **Build:** Store per prediction: inputs (each tagged auto-captured vs self-reported), aggregation used, transfer tier used (Section 5.4), method version, **dataset snapshot version** (the exact ingested data the prediction ran against), outputs (ranges), data-coverage references, timestamp, user.
- **Dependencies:** Built together with Phase 7 (M1); verified at Phase 7 completion.
- **Not yet:** No analysis of accuracy (no ground truth yet).
- **Done when:** Predictions are persisted and reproducible (method version + dataset snapshot + inputs retrievable).

### Phase 10 — Outcome capture (**✅ COMPLETE — 10a + 10b shipped 2026-09-20**, see `RANK_PREDICTOR_PHASE10A_REPORT.md` and `RANK_PREDICTOR_PHASE10B_REPORT.md`)
- **Objective:** Start building the paired dataset (Section 15) — timed to real result windows, which are externally scheduled: miss one and the next calibration cohort is months away.
- **Build (10a — minimal, M1):** consent-based post-exam form capturing actual score / percentile / rank, linked to the stored prediction (method + dataset snapshot versions) and GT history.
- **Build (10b — M2):** counselling outcome and allotted branch if shared; evaluation-dataset assembly.
- **Dependencies:** Phase 7 (persistence); Eyeconic live users.
- **Not yet:** No recalibration until data exists.
- **Done when:** A prediction can be joined to its actual outcome in the datastore — and 10a is live before the next result window.

### Phase 11 — Calibration / future ML
- **Objective:** Close the loop.
- **Build:** Measure prediction error (predicted range vs actual); recalibrate the prior and range widths; evaluate ML only when enough paired data exists (Section 16).
- **Dependencies:** Phase 10, 1–2 exam cycles of data.
- **Not yet:** No ML without real paired labels.
- **Done when:** (Ongoing) documented error metrics per exam; methodology version updated from measured data.

---

## 19. Implementation Principles

1. **Do not invent historical data.** No synthetic labels, no fabricated pairs, no guessed numbers presented as data.
2. **Do not treat Mayukh Hazra as the primary data source.** Secondary/reference only, always labelled crowd-sourced.
3. **Do not train ML without paired training data.**
4. **Do not present exact rank guarantees.** Ranges only.
5. **Do not mix exam patterns without normalization.** Pattern version on every record (Section 10).
6. **Do not mix counselling years without recording the year.**
7. **Do not mix categories or quotas.** Filter explicitly; never default silently to UR.
8. **Preserve source/provenance for every historical record.**
9. **Keep NEET PG and INI-CET prediction strategies separate** where their data differs (it does — marks exist for one, not the other).
10. **Keep the prediction engine independent from the existing quiz engine.** It consumes GT data; it must not entangle with quiz internals.
11. **Use real Eyeconic GT data when available** (Phase 1 audit determines what exists).
12. **Build outcome capture so the system can improve after Eyeconic goes live.**

---

## 20. Current Status and Next Action

### Current status

- **Feature:** **M1 + M2 COMPLETE (Phases 0–10b, 2026-09-20)** — sources (`RANK_PREDICTOR_SOURCE_CATALOGUE.md`) · GT audit (`RANK_PREDICTOR_GT_DATA_AUDIT.md`) · data (`RANK_PREDICTOR_INGESTION_REPORT.md`) · engine (`RANK_PREDICTOR_PHASE3_REPORT.md`) · rank (`RANK_PREDICTOR_PHASE4_REPORT.md`) · branches (`RANK_PREDICTOR_PHASE6_REPORT.md`) · API + persistence (`RANK_PREDICTOR_PHASE7_REPORT.md`) · UI (`RANK_PREDICTOR_PHASE8_REPORT.md`) · persistence audit (`RANK_PREDICTOR_PHASE9_REPORT.md`) · outcome capture (`RANK_PREDICTOR_PHASE10A_REPORT.md` + `RANK_PREDICTOR_PHASE10B_REPORT.md`) · INI-CET ingestion (`RANK_PREDICTOR_INICET_INGESTION_REPORT.md`) · INI-CET strategy (`RANK_PREDICTOR_PHASE5_REPORT.md`) · INI-CET branches (`RANK_PREDICTOR_PHASE6_INICET_REPORT.md`) · INI-CET UI (`RANK_PREDICTOR_M2_UI_REPORT.md`) · **UX/product polish P0–P4 (`RANK_PREDICTOR_UX_POLISH_REPORT.md` — presentation only, zero methodology/API changes; adds prediction history + share + auth gate + code splitting)**
- **Exams:** NEET PG + **INI-CET — BOTH LIVE** (`/predictor` UI → `/api/predictor/*`, every prediction persisted with per-exam method versions)
- **Legacy GtPredictor page: RETIRED** — `/gt-predictor` redirects to `/predictor`; one predictor only (§1)
- **MVP methodology:** Percentile-Transfer Prior (Tier 1 launch mode; baselines approved 2026-09-20) — method version `neetpg-branch-p6.v1`
- **Direct Eyeconic GT → actual exam outcome dataset:** Not available yet — **full capture is live and accumulating pairs** (10a: consent-based score/percentile/rank; 10b: counselling outcome + allotted institute/branch/round; every outcome linked to its stored prediction via method + dataset snapshot versions; evaluation dataset assembles on demand — `node scripts/phase10b/assemble_evaluation_dataset.js`)
- **ML model:** Future scope · **Outcome capture: COMPLETE** (10a + 10b) — calibration gated at ~100+ pairs (§16, Phase 11)
- **Known pre-existing client debt:** admin components carry tsc errors at HEAD (build script does not type-check); predictor files are clean

### Immediate next action

> **Phase 11 readiness (data-gated):** keep capturing through real result/counselling windows (the 10b form reaches every student on every stored prediction); re-run `node scripts/phase10b/assemble_evaluation_dataset.js` around each window and watch the §16 gate (~100+ pairs). Error measurement and any recalibration start only once that gate is met — until then no range narrowing, no fitting, per §18.
>
> Optional strengthening: the 2026 INI-CET session PDFs behind the AIIMS SPA (one-time manual browser grab, catalogue §5) would refresh the INI-CET anchor from Jul 2025 to a 2026 session.

(M1 + M2 COMPLETE. Store: `server/predictor-data/` — re-validate with `python scripts/phase2/validate_snapshots.py` (114 checks, NEET PG + INI-CET + prior). Server tests: `cd server && npm test` (236/236). Client: `cd client && npm run build`. Rank reproduction: `node scripts/phase4/verify_rank_reproduction.js` — 41,695/41,695 exact. Allotment recall: `node scripts/phase6/verify_allotment_recall.js` — 100/100; INI-CET: `node scripts/phase6/verify_inicet_allotment_recall.js` — **150/150 across 6 sessions**. Persistence: `node scripts/phase9/verify_prediction_persistence.js` — 13/13. Outcome capture: `node scripts/phase10b/verify_outcome_capture.js` — 17/17; dataset assembly: `node scripts/phase10b/assemble_evaluation_dataset.js`. INI-CET pipeline re-run: `python scripts/phase2/inicet_parse.py && python scripts/phase2/inicet_snapshots.py`; Phase 5 consistency: `node scripts/phase5/inicet_consistency_report.js`. **Data addendum 2026-09-21:** INI-CET **Jan-2026 fully ingested** (official manual-grab PDFs — catalogue §5): distribution `DS-INICET-DISTRIBUTION-202601-v1` banked as an additional validated snapshot, and the complete 1st+2nd+open round set built counselling snapshot `DS-INICET-COUNSELLING-202601-v1` (1,116 groups) — branch matching now covers **6 sessions**; **the active prediction anchor stays Jul-2025** (Option A; prior↔official session coherence preserved). The ingestion also hardened the round parser (whitespace-flexible institute names), recovering 12–28 silently-dropped AIIMS-ND rows per historical session — all five historical counselling snapshots rebuilt with the recovered rows (strictly additive; all pinned anchors unchanged).)

---

*This specification is the single source of truth for the Rank & Branch Predictor. Changes to methodology, data sources, or product rules must be reflected here before implementation follows them.*
