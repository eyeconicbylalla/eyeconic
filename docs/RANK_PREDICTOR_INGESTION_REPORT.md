# Rank & Branch Predictor — Phase 2 Ingestion Report

| | |
|---|---|
| **Status** | Phase 2 COMPLETE (2026-09-20) — all P2.1–P2.8 done; validator green (30/30) |
| **Approvals exercised** | Final-state cutoffs (approved 2026-09-19); D1 committed JSON snapshots; D2 no new dependencies; D3 2024 verified; D4 NEET PG only |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §18 Phase 2 |
| **Companion docs** | Source catalogue (`RANK_PREDICTOR_SOURCE_CATALOGUE.md`), GT audit (`RANK_PREDICTOR_GT_DATA_AUDIT.md`) |

## What was processed

| Artifact | Rows | Output |
|---|---|---|
| NBEMS 2025 Notice Board PDF (official, 4,850 pp) | **242,493 rows** = documented candidate count exactly | `DS-NEETPG-DISTRIBUTION-2025-v1` (score→rank bands, 18 KB) |
| crockzo 2025 R1+R2+R3 (mirror) | 66,349 listed → **41,695 final-state rows** (dedup by rank, latest round wins) | `DS-NEETPG-COUNSELLING-2025-v1` (**23,886** cutoff groups, 1.1 MB) |
| rahuldathu 2024 final_seat_allocation (mirror) | **36,391 final-state rows** (one row per rank) | `DS-NEETPG-COUNSELLING-2024-v1` (**21,341** groups, 864 KB) |

Layering (approved): `data/raw` (gitignored, PROVENANCE.txt + SHA-256 per source) → `data/parsed` → `data/normalized` (raw values preserved on every record) → committed snapshots in `server/predictor-data/` with `MANIFEST.json` (7 files hashed) and `golden/v1` fixtures. Distribution and counselling stores are strictly separate; the 66k crockzo subset was never treated as a distribution.

## Validation results

- **NBEMS crockzo oracle: 66,348/66,349 rank→score pairs reproduce exactly.** The single exception is rank 143757 (crockzo's documented nearest-rank substitution) — quarantined by policy, never silently kept.
- NBEMS structural assertions all pass: 230,096 numeric pairs; ranks unique; monotonic; 12,379 both-ABSENT rows and 18 WITHHELD rows excluded from the distribution and counted; scores span 707 → −40 (negative scores legitimate under +4/−1).
- **Extraction method note (D2):** Xpdf `-table` mode resolved the Phase 0 score-column misalignment (49/49 sample rows matched the oracle). No dependencies added; fitz/PyMuPDF (already installed) was used only for official-PDF *verification* extraction.
- **Mirror-vs-official joins** (fitz extraction over official MCC PDFs — R1/R2/R3 2025 + R1 2024, all four downloaded and hashed): on cleanly-parsed rows, mirror and official agree; **zero substantive data conflicts found**. Residual prefix-disagreement rates (R1-2025: 74.5% inst / 84.8% course prefix agreement through a lossy ad-hoc verifier) are column-interleave artifacts of wrapped two-line records in the verifier, demonstrated case-by-case (institutes visibly identical on both sides in the printed diffs). Mirror rows not covered by the verifier's parse (R1-2025: 329; R1-2024: 311) are parser-coverage gaps, not missing mirror data. The oracle plus clean-row agreement is the accepted evidence standard; the verifier script is committed for re-runs.
- **Golden validator: 30/30 checks pass** (`scripts/phase2/validate_snapshots.py`), including pinned bands, enum canonicity, structural invariants, dictionary mappings, and the rank-1 official anchor from the MCC R1 2025 PDF.

## Quarantined / anomalous records

| Item | Count | Handling |
|---|---|---|
| Unmapped quota/category values | **0** quarantined rows (both years) | all 25+ raw variants mapped with raw preserved |
| crockzo rank 143757 | 1 | documented exception; excluded from oracle expectations; distribution is NBEMS-authoritative so no substituted value enters any snapshot |
| `GNYes` (crockzo candidate category) | 110 | mapped GN+PwD-Yes → UR/PwD with documented note; candidate category does not affect cutoffs |
| `\r`-embedded PwD variants (rahuldathu) | 85 | mapped; raw preserved |
| WITHHELD rows (NBEMS) | 18 | excluded from distribution, counted |
| ABSENT rows (NBEMS) | 12,379 | excluded from distribution, counted |

## Corrections made during Phase 2 (evidence-based, documented in-dictionary)

1. **AD=DNB, AM=AMU** (initial legend reading had AD=AMU) — proven empirically (9,237/9,239 AD rows are (NBEMS) courses at DNB hospitals); catalogue corrected.
2. **Round semantics**: crockzo R2/R3 are changes-only lists → final-state cutoffs built from deduped union (approved by you before rebuild).
3. Xpdf `file`-reported page counts for MCC PDFs were wrong (R1 2025 is 1,301 pages, not 10) — full-document extraction used.

## Provenance (also in MANIFEST.json + per-snapshot headers + per-row in normalized layer)

- NBEMS PDF: official URL, SHA-256 `6d9d3ecd…feb5db`, 28,776,856 bytes, 2025-08-20
- MCC R1/R2/R3 2025 + R1 2024 PDFs: official CDN URLs, SHA-256 each (manifest)
- crockzo: pinned commit `4c2a796e4af57ebc112eaa6cad0b8fa558d3e80c`
- rahuldathu: pinned commit `b5c0824a5068bcaef5ad990dee58389f46d37b03`

## What Phase 2 did NOT change

No Eyeconic application code, schemas, migrations, or APIs in either repo. All additions live in `eyeconic-main`: `scripts/phase2/*`, `server/predictor-data/*` (committed), gitignored `data/` layers. Read-only discipline maintained.

## Open items (informational, no approval needed)

- 2025 R2/R3 *per-round-published-list* cutoff views remain possible later from the preserved round-level normalized layer (not MVP).
- Institute display names still carry MCC's concatenated campus strings (join keys are stable across years by design); display-name cleanup is a future UI-layer refinement.

**Next: Phase 3 — prediction engine foundation** (exam-strategy interface, GT validation incl. §3.6 category/quota, aggregation with the §3.3 dedup rule, Tier-1/Tier-2 ladder + cohort threshold, dispersion-aware range width inputs).
