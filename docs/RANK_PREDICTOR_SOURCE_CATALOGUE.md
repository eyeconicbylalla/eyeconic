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
| 6 | AIIMS INI-CET result + allotment PDFs | INI-CET 2021–2026 | **VERIFIED + INGESTED** (2021–2025 corpus 2026-09-20; **Jan-2026 complete** — result + all 3 rounds via manual grab 2026-09-21; Jul-2026 still SPA-gated — see §5) | **M2** ✓ Phase 1 |
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

## 5. AIIMS INI-CET result + allotment PDFs — INI-CET 2021–2025 (OFFICIAL — M2 Phase 1, 2026-09-20)

- **Hosts:** live document host `docs.aiimsexams.ac.in/sites/<file>` (2023–2025 files, HTTP 200 direct); old portal `www.aiimsexams.ac.in/pdf/...` is dead live but preserved in the **Wayback Machine** (2021/2022 files fetched from archived copies). The portal itself is now a JS SPA whose API endpoints are hash-obfuscated — filename enumeration + CDX is the practical path (`scripts/phase2/inicet_enumerate.py`, index at `data/raw/aiims/index.json`).
- **Ingested corpus (27 PDFs, sha256 in `data/raw/aiims/PROVENANCE.txt`):**
  - **Result notifications (6 sessions):** Jul-2021, Jan-2022 (wayback), Jul-2023, Jan-2024, Jan-2025, Jul-2025. Columns: `S.No | Roll | Category | Applied-Under | PWBD | Overall Rank | Percentile`. **No marks — AIIMS has never published INI-CET marks** (spec §9). MD/MS and MDS are **separate rank spaces** (MDS restarts at rank 1).
  - **Seat-allocation rounds (19 files):** Jan-2023 (1st/2nd/open), Jul-2023 (1st/open — 2nd not found anywhere), Jan-2024, Jul-2024, Jan-2025, Jul-2025 (each 1st/2nd/open), plus Jul-2021 (1st only, wayback) and Jan-2022 (1st/2nd, wayback). Columns: `Roll | Overall Rank | Category | PWBD | Specialty | Institute | Category/Roster-Point of allocated seat`. The files list **all qualified candidates rank-wise**; non-allotted rows carry `FCNA`/`NR-NP`/`NSA`/`Seat Allocation Completed` markers with `NA` columns.
- **Seat-token grammar (derived from data):** `CAT[-PWBD][-roster][/COURSE-TAG]` (e.g. `UR`, `UR-1`, `EWS-10/OPH`, `UR-PWBD`), plus separate pools: `IP-n` sponsored, `INST-n` institute, `OCS` (open-round non-clinical), domicile/preference earmarks (`UR-Karnataka Domicile`, `UR-AIIMS-Preference`), and Foreign-National rows with no seat token. An OBC candidate can hold a UR seat → **cutoffs key on the seat category** (same decision as NEET PG `allotted_category`).
- **Verification:** parse = **0 unparsed data lines** across all 19 round files (institute-anchored row parser — column gaps are unreliable under `pdftotext -table`); ranks unique per section; percentile non-increasing; official anchors reproduce (Jul-2025: ranks 2–4 = AIIMS ND Medicine UR; rank 5 = AIIMS ND Radiodiagnosis; rank 1 = NIMHANS DM-Neurology-6yr). Snapshot validator: 58 checks green; goldens pin counts + anchors.
- **✅ January 2026 session — COMPLETE (manual browser grab, 2026-09-21):**
  - **Result / qualified-candidates list — OBTAINED + INGESTED.** Official AIIMS Result Notification **No. 250/2025, dated 15-11-2025** (INI-CET January 2026 session; CBT held 09-11-2025; 500 pages; 74,285,973 bytes; SHA-256 `a25181e4378e224f0bf3e55395cbf33cfa9937643ce47694fb716d14fb0f55da`; local `data/raw/aiims/2026-01/result.pdf`). Committed as distribution snapshot **`DS-INICET-DISTRIBUTION-202601-v1`** (MD/MS 30,071 qualified, ranks 1–31,511, 1,440 gaps, percentile 100.0000000 → 45.4610698; page-1 anchors reproduce exactly — rank 226 → 99.6254026, rank 1,525 → 97.3533118). Schema note: **2026-01 publishes percentiles with up to 7 decimals** (all earlier sessions ≤ 6) — the parser regex widened `{1,6}` → `{1,7}` (verified byte-identical on every historical parse). The snapshot stores micros (×10⁶), rounding the 7th decimal (≤ 1e-7 percentile — documented in the snapshot's format_doc).
  - **Complete round set (1st + 2nd + open) — OBTAINED + INGESTED as counselling snapshot `DS-INICET-COUNSELLING-202601-v1`.** 1st round = Notification **327/2025, dated 18-12-2025** (510 pages; 30,159,750 B; SHA-256 `d3efdbf5…`); 2nd round = Notification **02/2026, dated 09-01-2026** (157 pages; SHA-256 `f5cee02c…`); open round = Notification **69/2026, dated 21-02-2026** (35 pages; 2,989,843 B; SHA-256 `53e0f19b…`). Final state: 2,618 candidates (1,611/1,274/754 MD/MS per round), 2,218 general-pool, **1,116 groups**, 23 institutes, 52 canonical specialties. Official anchors pinned (Notification 327/2025 page 1: rank 1 = JIPMER GenMed UR; rank 2 = AIIMS ND Radiodiagnosis; ranks 3–6 = AIIMS ND GenMed UR closing 6).
  - **Anchor decision (2026-09-21, Option A — UNCHANGED):** the active INI-CET prediction anchor REMAINS **July 2025** (`DS-INICET-DISTRIBUTION-202507-v1`), preserving session coherence with the crowd-sourced prior (Phase 5). Jan-2026 extends branch-matching coverage to a 6th session only.
  - **Parser hardening found during this ingestion (applies corpus-wide):** some round-PDF pages render institute names with doubled internal spaces (`AIIMS  NEW  DELHI`), which the institute-anchored row parser silently skipped. The regex is now whitespace-flexible; re-parsing recovered **12–28 silently-dropped AIIMS-ND rows per historical session** (strictly additive — zero removals/modifications; all pinned anchors unchanged), and all five historical counselling snapshots were rebuilt with the recovered rows.
- **⚠ Still not obtainable programmatically:**
  - **Jul-2026 session** — result was declared 2026-05-23 ("List of Qualified Candidates in INI-CET July 2026 session") and its 2nd + open seat-allocation rounds are published on the portal, but all files sit behind the hash-obfuscated SPA result pages (the same manual grab that closed Jan-2026 would close it).
  - Re-probed 2026-09-20/21: 24 docs-host filename-grammar probes (Jan/Jul × result/round variants) all 404; a fresh Wayback CDX pass (1,951 archived docs files) surfaces no 2026 INI-CET files — the sole "26"-named hit (`26_Result.pdf`) is a Dec-2023 CRE-AIIMS recruitment notice, unrelated; the SPA's `/result/[id]` and notice pages render zero server-side links (client-fetched API). Third-party news-site re-hosts were deliberately NOT used (provenance unverifiable against the official original; spec §7.5).
  - Jul-2023 **2nd round** not found live or archived (session excluded from counselling snapshots — final-state would be wrong without it). Jan-2021 exists only as an 8×-seats eligibility list (not a full result). Spot-round ALLOTMENT lists were never published (only vacancy notices).

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
