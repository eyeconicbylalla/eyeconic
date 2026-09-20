# Rank & Branch Predictor — Phase 7 Report (Backend API + Phase 9 Persistence)

| | |
|---|---|
| **Status** | Phase 7 COMPLETE (2026-09-20) — 18 new integration tests; full server suite **181/181** (15 suites); Phase 2 validator 30/30; allotment recall still 100/100 |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §18 Phase 7 (with Phase 9 built in) |
| **New env vars** | None — reuses MONGO_URI (persistence), SESSION_SECRET + App integration env (auth), all already required by the deployed server |

## What was implemented

### 1. API surface — `server/routes/predictor.js`, mounted at `/api/predictor` (server.js)

All routes authed by the student's **App session** (encrypted HttpOnly cookie; identity = `req.appSession.user.id`, the canonical App `User._id`); non-GET routes carry the same same-origin CSRF guard as the app proxy; upstream 401s clear the session (APP_SESSION_REQUIRED) exactly like `/api/app/*`.

| Endpoint | What it does |
|---|---|
| `GET /exams` | exam list with explicit availability (INI-CET `available: false` → M2) |
| `POST /predict` | runs the Phase 3–6 engine; **persists before serving** (see §2); rate-limited 60/hour per user (Mongo-backed fixed window) |
| `GET /gts` | GT auto-fill: pages the App analytics endpoint (≤10 pages × 100), keeps `testType === 'grand'`, maps to the engine input shape tagged **auto-captured** (corrects = `score`, totals, `skipped`, `endTime`; both attempts listed — the ENGINE applies the one-per-GT dedup); plus **self-reported** values echoed from the student's latest prediction, clearly tagged, for confirm/edit pre-fill |
| `GET /predictions` | the student's own history (paginated; exam, method version, percentile + AIR ranges, branch coverage, GT count, date) |
| `GET /predictions/:id` | full stored record, own-only; recomputes the stored `resultHash` for tamper/corruption evidence (`integrity.matches`) |
| `GET /predictions/:id/branches` | **paginated** branch rows (band/year/page/limit filters — unknown band/year is a 400, never a silently-ignored filter); 409 `CATEGORY_REQUIRED` for predictions stored without a category |

**Response pagination of branch rows** (Phase 6 open item): `POST /predict` responses carry band **counts + coverage** but no row arrays (a mid-range student has ~2,300 groups/year); rows are served page-by-page from the branches endpoint.

### 2. Persist-before-serve (Phase 9, the phase's core guarantee)

- Engine result stages (method incl. dataset snapshot ids, inputs incl. per-GT provenance + exclusions, aggregation incl. alternatives, estimate incl. tiers, rank, branch summary) are hashed (`resultHash`, sha256 over canonical JSON) and written to the new `Prediction` model (MongoDB, `userId + createdAt` indexed) **before** the 201 goes out. A failed write returns `500 PREDICTION_NOT_STORED` and **no prediction is served** — pinned by a test that forces the write to fail.
- Stored per §18 Phase 9: inputs (auto-captured vs self-reported tags), aggregation used, transfer tier, method version, dataset snapshot versions, outputs (ranges), data-coverage references, timestamp (createdAt), user — plus the **exact request body** for byte-faithful re-derivation.
- **Branch rows are not stored** (~2,300 rows/year would bloat every document): they are a deterministic function of (request, method version, snapshot versions), all of which are stored. The branches endpoint re-derives rows and **verifies** the re-derivation against the stored counts (`verified: true`; a method/data drift surfaces an explicit `verification` block with stored-vs-recomputed values instead of a silent mismatch).
- Retrieval is own-only (404 cross-user, tested).

### 3. Engine/API boundary

The route file is the only place the predictor meets the App world (GT auto-fill via `callAppApi`); the engine stays quiz-independent (§19.10). No cohortProvider is wired: GT-cohort stats would need an App-side endpoint that doesn't exist (app repo feature-frozen), so API predictions run **Tier 1** — exactly the launch mode the Phase 1 audit predicted; the engine's injectable provider remains for M2+.

## Validation results

| Check | Result |
|---|---|
| Phase 7 done-when: endpoints with auth, validation, complete metadata | ✅ 18 integration tests (mock App API + Mongo memory server): 401s without session; CSRF 403; field-path 400s (bounds, quota, category); INI-CET 400 `EXAM_NOT_AVAILABLE`; rate limit 429; own-only 404s |
| Phase 9 done-when: predictions persisted and reproducible | ✅ persist-before-serve (forced-write-failure test); retrieval with matching integrity hash; request + method version + snapshot ids retrievable; branch re-derivation verifies |
| GT auto-fill | ✅ maps App analytics (paging loop exercised across mock pages), filters non-grand quizzes, tags provenance, self-reported echo |
| Regression | ✅ full suite 181/181 (engine 134 + website 29 + API 18); Phase 2 validator 30/30; Phase 6 recall 100/100 |

## Files

**New** — `server/routes/predictor.js` · `server/models/Prediction.js` · `server/tests/predictorApi.test.js` · this report.
**Modified** — `server/server.js` (mount `/api/predictor`) · spec §20.
**Untouched** — engine internals (all 12 modules byte-identical to Phase 6); snapshot data; app repo; client.

## Limitations & decisions

1. **Retest flags in auto-fill**: the App analytics payload has no retest fields, so auto-captured attempts map `retestApprovedUsed: false` (documented in the /gts response note). The one-per-GT rule still applies via latest-endTime; the retest preference activates when the App feed exposes it (M2 coordination, Phase 1 audit G1/G3).
2. **Tier 2 unreachable via API** (no cohort endpoint on the App side, repo frozen) — by design for launch; engine support + threshold exist.
3. **Branch re-derivation caveat**: rows are recomputed with the *current* engine + snapshots; a future re-ingestion or method bump makes old predictions report `verified: false` with an explicit diff block rather than fabricating the original rows (the stored summary/counts always reflect what was actually served).
4. **Rate limit** (60/hour/user) is a protective default, not a product rule — tune freely in `routes/predictor.js` constants.
5. History/pagination defaults (10/page history, 25/page branches, max 100) are API-layer ergonomics, adjustable without touching the engine.

## Next

**Phase 8 — frontend (M1 = NEET PG UI)**: exam selector, GT input with auto-fill (provenance-tagged), assumption notes, result display (ranges + coverage + notes, width scaling with GT count/dispersion), branch results with banding + extreme-range states, disclaimers — and **retirement/redirect of the legacy `GtPredictor.tsx`** so only one predictor is ever live. Phase 10a (minimal consent-based outcome form) ships with/just after M1 per the milestone plan.
