# Rank & Branch Predictor — Data Source Catalogue

| | |
|---|---|
| **Purpose** | Phase 0 deliverable: verified sources, provenance, quality findings, ingestion hazards |
| **Scope** | M1-critical sources verified 2026-09-19; all other sources catalogued with status + milestone |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` (§7 sources, §18 Phase 0) |
| **Raw data** | `data/raw/` (gitignored, re-downloadable) · verification script: `scripts/verify_phase0_sources.py` |
| **Machine report** | `data/verification/phase0_report.json` |

**Verification status summary**

| # | Source | Exam/Year | Status | Milestone |
|---|---|---|---|---|
| 1 | NBEMS Notice-Board Result PDF | NEET PG 2025 | **VERIFIED** (live, complete, structure confirmed) | M1 |
| 2 | MCC R1 allotment PDF (official CDN) | NEET PG 2025 | **VERIFIED** (live, row-matched vs mirror) | M1 |
| 3 | MCC R2/R3 allotment PDFs (official CDN) | NEET PG 2025 | REACHABLE (HTTP 200); download deferred | M1 ingestion (Phase 2) |
| 4 | crockzo/neet-pg (mirror) | NEET PG 2025 | **VERIFIED** (66,349 rows, 0 monotonicity violations, row-matched vs official) | M1 |
| 5 | rahuldathu CSVs (mirror) | NEET PG 2024 | **STRUCTURE-VERIFIED**; row-level check vs 2024 official PDFs pending | M1 ingestion (Phase 2 verify) |
| 6 | AIIMS INI-CET result + allotment PDFs | INI-CET 2021–2026 | Needs verification | **M2** |
| 7 | Sartha.in cutoff tables | NEET PG 2024–25 | Cross-check only | M2 |
| 8 | Kaggle NEET-PG-2019 dataset | NEET PG 2019 | Needs verification (login-gated) | Not scheduled |
| 9 | Careers360 / Shiksha / GetMyUni tables | — | Cross-check only; GetMyUni avoid | Not scheduled |
| 10 | Dr Mayukh Hazra YouTube | INI-CET priors | Secondary/reference only, labelled | M2 (INI-CET Tier 3) |

---

## 1. NBEMS Notice-Board Result PDF — NEET PG 2025 (OFFICIAL)

- **Role:** relationship B (score → rank). The complete empirical distribution — 242,493 candidates, `Total Score (Out of 800)` + `NEET-PG 2025 Rank`. A lookup, not a model.
- **Provenance:** `https://natboard.edu.in/natboard-data/pdf/NEETPG2025RESULT/NEET-PG 2025 Notice Board Result - 19.08.2025 - DS.pdf` · downloaded 2026-09-19 · 28,776,856 bytes (matches Content-Length exactly) · Last-Modified 2025-08-20 · **SHA-256 `6d9d3ecd02bd182e0d9439ea3dff1cc92ff0d0ec574db6dcb4a3846e25feb5db`** · local: `data/raw/nbems/neet-pg-2025-notice-board-result.pdf`
- **Verified:** HTTP 200 direct download works despite the site's Turnstile gate (re-confirmed). PDF 1.6, **4,850 pages**. Column structure confirmed on sampled pages (1–2, 1000–1001, 2500–2501, 4848–4849): `S.No | Application ID | Roll Number | Total Score | NEET-PG 2025 Rank`, roll-number-ordered.
- **⚠ CRITICAL ingestion hazard (new finding):** naive `pdftotext -layout` parsing **misaligns the score column** — a row's score sometimes renders on the same line, sometimes on the following line (variable row heights; blank/ABSENT cells cascade the shift). Empirically: sampled ranks reproduce crockzo's official-derived score 6/44 same-line, 30/44 next-line, 36/44 within a 4-line window. **Phase 2 must use coordinate-aware extraction** (e.g. `pdftotext -bbox`, pdfplumber-style x/y snapping), never plain line regexes.
- **Data-quality notes:** `ABSENT` values occur in *both* score and rank columns (82 in a 400-row sample — NBEMS lists absentees too; exclude non-numeric rows from the distribution); blank scores occur (18/400 sample). Candidate names are NOT published (good — no PII).
- **Count check:** 4,850 pages × ~50 rows/page ≈ 242,500 rows — consistent with the documented 242,493 candidates. Full row-count confirmation happens at Phase 2 ingestion.

## 2. crockzo/neet-pg — NEET PG 2025 mirror (VERIFIED)

- **Role:** M1 ingestion accelerator for both relationships B (rank↔score, joined from the NBEMS PDF by the repo author) and C (R1–R3 allotments → closing ranks). Supersedes the need to ETL the official PDFs for M1, per spec Phase 2 "mirror-first".
- **Provenance:** `github.com/crockzo/neet-pg` · pinned commit `4c2a796e4af57ebc112eaa6cad0b8fa558d3e80c` · downloaded 2026-09-19 · local: `data/raw/crockzo/round-{1,2,3}-data.js` (9.0/7.2/6.4 MB)
- **Structure:** `const ROUND_N_DATA = [...]` JSON arrays — trivially parseable. Fields: `sno, rank, score, quota, institute, state, course, allottedCategory, candidateCategory, remarks`.
- **Verified stats (script output):**
  - Rows: R1 **26,889** + R2 **20,787** + R3 **18,673** = **66,349** (matches research claim of ~66k)
  - Ranks span 1–230,087; scores −12 to 707 (negative scores are legitimate under +4/−1 marking)
  - **Monotonicity violations: 0 in all three rounds** (rank ↑ ⇒ score never ↑) — strong internal consistency
  - Row 1 matches the official MCC R1 PDF exactly (rank 1 → PGIMER/Dr RML Hospital, M.D. General Medicine, Open, General, Allotted); rank 2 (GMC Kozhikode) also matches
  - Score column agrees with the NBEMS PDF wherever the PDF's text alignment is resolvable (see hazard above)
- **Repo-documented methodology (README):** allotment rows scraped from the **official MCC CDN PDFs** (R1/R2/R3 direct URLs listed — captured in §3 below); rank→score joined from the same NBEMS Notice-Board PDF we verified. One disclosed anomaly: **rank 143757 absent from the NBEMS PDF → nearest rank's marks (143758 → 226) substituted**. Unofficial community copy, no license — internal use + attribution per spec §7.2.
- **Limitations:** single year (2025); the disclosed 143757 substitution; no opening ranks (derive both by aggregation anyway).

## 3. MCC allotment PDFs — NEET PG 2025 (OFFICIAL, CDN)

- **Role:** relationship C ground truth (and the official backing for crockzo). Columns: `SNo | Rank | Allotted Quota | Allotted Institute | Course | Allotted Category | Candidate Category | Remarks` — no marks, no precomputed closing ranks.
- **URLs (from crockzo README, verified live 2026-09-19):**
  - R1: `cdnbbsr.s3waas.gov.in/s3e0f7a4d0ef9b84b83b693bbf3feb8e6e/uploads/2025/11/202511221303622410.pdf` — HTTP 200, 5,069,993 bytes → downloaded: `data/raw/mcc/mcc-r1-2025.pdf`
  - R2: `.../2025/12/202512172132273940.pdf` — HTTP 200, 9,572,755 bytes (download deferred to Phase 2)
  - R3: `.../2026/02/20260206892439077.pdf` — HTTP 200, 9,520,528 bytes (download deferred to Phase 2)
- **Verified:** R1 PDF genuine (dated 2025-11-21); page 1 is the official **abbreviation legend — directly reusable as the seed of the Phase 2 canonical dictionaries**: quota codes (AI=All India, BH=Banaras Hindu University, DU=Delhi University Quota, AM=Aligarh Muslim University, **AD=DNB — confirmed empirically in Phase 2, the legend's interleaved layout makes positional pairing ambiguous**, IP=IP University Quota, MM=Muslim Minority, JM=Jain Minority, NR=Non-Resident Indian, PS=Self-Financed Merit/Paid Seat) and category codes (BC=OBC-NCL, EW=General-EWS, GN=Open, SC, ST, each + PwD variant).
- **Ingestion notes:** records wrap across two interleaved visual lines (see R1 page 2) — this is precisely why mirror-first ingestion is the M1 strategy; official PDFs are the verification sample, not the primary ETL target.

## 4. rahuldathu/NEET-PG-College-Predictor-2025 — NEET PG 2024 mirror (STRUCTURE-VERIFIED)

- **Role:** relationship C, year two (2024) of the cutoff table.
- **Provenance:** `github.com/rahuldathu/NEET-PG-College-Predictor-2025` · pinned commit `b5c0824a5068bcaef5ad990dee58389f46d37b03` · downloaded 2026-09-19 · local: `data/raw/rahuldathu/`
- **Verified structure:**
  - `R1.csv` — **headerless**, 8 columns (same as crockzo), 24,671 data rows (1,337 blank lines to skip), ranks 1–129,915. No score column (as expected).
  - `R2.csv` — 13 columns: the 8 base + reporting-status columns (`Reported`/`Not Reported`, `-` placeholders, willingness remarks like "Did not fill up fresh choices."). **Different row semantics than R1** — Phase 2 must confirm against the 2024 R2 official PDF before treating rows as allotments.
  - `R3.csv` — 16 columns, embedded newlines inside quoted fields (csv-module handles); same caveat as R2.
  - `final_seat_allocation.csv` — **has header** (`rank,allotted_quota,allotted_institute,course,allotted_category,candidate_category,round,remarks`), 36,391 rows — the resolved final table; likely the operative 2024 file for cutoffs.
  - `inference_table.csv` — **bonus: precomputed closing ranks** (`college,course,quota,category,min_rank,cutoff_rank`), 23,426 rows. Useful only as a cross-check — we re-derive cutoffs from raw rounds.
- **⚠ Not yet row-verified:** these are **2024** rows; verifying them requires the 2024 MCC PDFs (not downloaded — out of Phase 0 timebox). A cross-comparison against the 2025 crockzo data was performed and correctly showed ~no row agreement — expected across years, not an error. **Phase 2 must download the 2024 MCC R1 PDF and row-match a sample before this source enters production.**
- **Naming hazard confirmed:** course naming diverges even within this repo (`M.D. (GENERAL MEDICINE)` in R1 vs `(NBEMS) ANAESTHESIOLOGY` in inference_table) — validates the canonical-dictionary requirement (spec Phase 2).

---

## Re-run verification

```bash
# raw files must exist under data/raw/ (see provenance files in each subdir)
python scripts/verify_phase0_sources.py   # writes data/verification/phase0_report.json
```

The script is read-only and idempotent. New findings should be added to this catalogue, not just the JSON report.

## Findings feeding Phase 2 (checklist)

1. NBEMS PDF: coordinate-aware extraction mandatory (bbox/pdfplumber) — no line-regex parsing.
2. NBEMS PDF: drop `ABSENT`/blank rows from the distribution; assert final count ≈ 242,493.
3. crockzo: primary M1 ingestion path; sample-verify R2/R3 against MCC R2/R3 PDFs at ingestion (Phase 2).
4. crockzo anomaly: rank 143757 carries substituted marks — flag the record or re-derive from NBEMS PDF.
5. rahuldathu: skip blank lines; per-file schemas differ (8/13/16 cols); verify vs 2024 official PDFs before production use; `final_seat_allocation.csv` is the operative file.
6. Canonical dictionaries: seed from the MCC R1 legend page (quota + category codes); normalize course names across `M.D. (GENERAL MEDICINE)` / `(NBEMS) ANAESTHESIOLOGY` styles.
7. Never mix years in one join — 2024 and 2025 tables answer to different allotments for the same rank number (demonstrated, not hypothetical).
