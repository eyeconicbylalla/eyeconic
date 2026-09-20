# Rank & Branch Predictor — Phase 10a Report (Minimal Outcome Capture)

| | |
|---|---|
| **Status** | Phase 10a COMPLETE (2026-09-20) — **M1 is now complete**: data → engine → rank → branches → API + persistence → UI → outcome capture. 13 new API tests; full server suite **198/198** (15 suites); client builds clean. |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §15 (outcome capture), §18 Phase 10a, §4 (the missing paired dataset), §16 gate ("Enough paired outcomes… ~100+ before any fitting") |
| **Code** | `server/models/OutcomeCapture.js` (new) · `server/routes/predictor.js` (+3 endpoints) · `client/src/pages/Predictor.tsx` (outcome card) · `client/src/lib/predictorClient.ts` · `client/src/types/predictor.ts` |
| **New env vars** | None |

## What was implemented

### 1. Storage — `OutcomeCapture` model

One document per prediction (**unique index on `predictionId`** — corrections overwrite via PUT, never append):

| Field | Content |
|---|---|
| `userId`, `predictionId`, `exam` | ownership + the join key |
| `consentGivenAt` | timestamp of the consent this submission was made under (every PUT re-consents) |
| `outcome` | `{ score, percentile, rank }`, each nullable — at least one required by the API |
| `linkage` | **copied from the prediction at capture time** (§15): `methodVersion`, `datasetSnapshots`, `predictionCreatedAt`, `gtsUsed` — the pair stays auditable even if the prediction changed later, and is re-verified on read |
| `source` | `'self-reported'` (10a); the field exists so later automation is distinguishable without a migration |

§15 "store the minimum required… nothing speculative": no free text, no counselling fields (rejected by the API with an explicit M2 message, never silently stored or ignored), no consent-text copies.

### 2. API — mounted in `routes/predictor.js` (same auth + CSRF + DB gate)

| Endpoint | Behaviour |
|---|---|
| `PUT /predictions/:id/outcome` | create-or-correct, own-only (prediction must be the caller's); consent `true` required (`CONSENT_REQUIRED`); ≥1 of score/percentile/rank (`OUTCOME_EMPTY`); score = integer 0–800 (bounds derived from the engine's 800-scale pattern config, not a stale route constant); percentile 0–100 (stored to 4 dp); rank = integer ≥1 with a 10⁶ sanity bound; Phase 10b counselling fields → `OUTCOME_FIELD_NOT_AVAILABLE`; any other unknown key → `OUTCOME_UNKNOWN_FIELD` (minimum-storage rule). Rate-limited 30/hour/user (fails open like predict). Upsert with unique-index race recovery (11000 → update). |
| `GET /predictions/:id/outcome` | the stored outcome + **`linkageCheck.matches`** (capture-time linkage copy re-verified against the live prediction — mirrors the Phase 9 `resultHash` verification) + `predictionSummary` (predicted percentile/rank ranges, method version, GT count) for honest predicted-vs-actual display. `404 OUTCOME_NOT_FOUND` is the "nothing recorded yet" state. |
| `DELETE /predictions/:id/outcome` | **withdrawal** removes the document entirely — consent-based means withdrawable. |

Validation errors always carry a `field` path, matching the predictor API convention.

### 3. UI — outcome card on the prediction result (`/predictor`), reachable from the result

- **Nothing recorded:** collapsed card — *"Result out? Make the next prediction better"* → "Add my actual result".
- **Form:** three optional inputs (score /800, percentile, AIR) with client-side validation mirroring the server; §15 consent checkbox (required, re-ticked on every submission incl. edits); server field errors land inline.
- **Recorded:** values + predicted-vs-actual context (*"This prediction said AIR X – Y · your pair is saved to calibrate future ranges"*), **Edit** (re-consent) and **Withdraw** (two-tap confirm, no native dialog).
- Voluntary by design: the card is optional chrome — transient load failures degrade to the collapsed intro, never block the predictor.

### 4. What this buys (§4/§15/§16)

Every recorded outcome is a paired observation `GT performance → actual exam outcome`, joined via `predictionId` to everything Phase 9 stored (inputs + provenance, aggregation, transfer tier, ranges, method + dataset snapshot versions) — the calibration dataset Phase 11 needs, gated at ~100+ pairs before any fitting is discussed. No analysis runs yet (§18 Phase 10 "Not yet: no recalibration until data exists").

## Validation performed

| Check | Command | Result |
|---|---|---|
| Outcome API suite (13 new tests in `tests/predictorApi.test.js`): create + linkage copy, GET + linkage check, correction-overwrite (one doc), consent gate, empty gate, bounds/field-path errors (5 cases), 10b rejection, unknown-field rejection, own-only (PUT/GET/DELETE cross-user 404), unknown/malformed id 404, empty-state 404, withdrawal, **linkage drift detection** (tampered prediction → `matches: false`) | `cd server && npx jest tests/predictorApi.test.js` | ✅ 34/34 |
| Full server suite | `cd server && npm test` | ✅ **198/198** (15 suites) |
| Client type-check (predictor files) + eslint | `npx tsc -b tsconfig.app.json` / `npx eslint <files>` | ✅ clean (pre-existing admin-component tsc errors at HEAD unchanged) |
| Client build | `cd client && npm run build` | ✅ (pre-existing chunk-size warnings only) |
| Phase 9 persistence script (regression) | `node scripts/phase9/verify_prediction_persistence.js` | ✅ 13/13 |

## Files

**New** — `server/models/OutcomeCapture.js` · this report.
**Modified** — `server/routes/predictor.js` (3 endpoints + validation, header note) · `server/tests/predictorApi.test.js` (+13) · `client/src/pages/Predictor.tsx` (OutcomeSection + `predictionId` prop) · `client/src/lib/predictorClient.ts` (3 endpoints + `errorField` helper) · `client/src/types/predictor.ts` (outcome types) · spec §18/§20.
**Untouched** — the engine (all prediction modules), snapshot data, Phase 9 persistence logic.

## Limitations & decisions

1. **Self-report is the only source in 10a** (§15 allows "later automation where possible"); `source` anticipates it without schema churn.
2. **No timing/scheduling logic** — §15 asks around result windows; the card is present whenever a student views a prediction, which is when motivation peaks. No arbitrary reminders in 10a.
3. **10b (M2):** counselling outcome + allotted branch capture, and evaluation-dataset assembly. The API already rejects those fields with an explicit message, so clients can't accidentally store partial 10b data.
4. Percentile stored to 4 decimals — INI-CET publishes 3–4 (M2-ready); NEET PG students typically derive 2.
5. Rank sanity bound 10⁶ (NEET PG 2025 had 242,493 candidates) rejects typos, not plausible ranks.

## Where the project stands

**M1 COMPLETE** — the launchable NEET PG vertical slice end to end, including the outcome-capture loop. **Next: M2** per the milestone plan (§18): AIIMS source enumeration + INI-CET ingestion (Phase 2 extension) → Phase 5 INI-CET strategy → Phase 6 INI-CET branch matching → INI-CET UI → Phase 10b full capture. True calibration analysis stays gated on ~100+ captured pairs (§16).
