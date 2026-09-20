# Rank & Branch Predictor — Phase 8 Report (Frontend, M1 = NEET PG UI)

| | |
|---|---|
| **Status** | Phase 8 COMPLETE (2026-09-20) — new UI built at `/predictor`; **legacy `GtPredictor.tsx` deleted, `/gt-predictor` redirects (only one predictor is live)**; client builds clean, my files type-check + lint clean; full server suite still 181/181 |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §13 (Output/UI), §14 (Confidence/Disclaimer), §18 Phase 8 |
| **Route** | `/predictor` behind `RequireAuth` (App student session); entry point added on the Dashboard |

## What was implemented

### 1. New files

- **`client/src/types/predictor.ts`** — typed API contract (exams, GT inputs + provenance, prediction result, branch rows/summaries).
- **`client/src/lib/predictorClient.ts`** — axios instance for `/api/predictor` (HttpOnly-cookie auth like `/api/app/*`, 401 → shared session-expired event), friendly error messages, and server field-path → row-index mapping for inline errors.
- **`client/src/pages/Predictor.tsx`** — the student-facing flow (details below).

### 2. §13/§14 checklist → what the UI does

| Requirement | Implementation |
|---|---|
| Exam selector, extensible | NEET PG selected; INI-CET listed but disabled with "Coming soon · M2" (from `GET /exams`) |
| Category required before branches, **never defaulted** | select starts at "Select category…"; PwD checkbox appears with a category; explicit helper text; rank prediction works without it |
| Quota explicit | read-only chip "Quota: All India Quota" (MVP scope) |
| GT input: dynamic list, 1 row to start, add/remove, **no cap** | `+ Add another GT`; last row cannot be removed |
| Auto-fill from Eyeconic | on mount `GET /gts` pre-fills Grand Tests (title, date, "latest of N attempts"); **editing an auto row flips it to self-reported** (chip changes, "edited → self-reported" shown); self-reported values from the last prediction offered as one-click "+ N corrects (last time)" suggestions |
| Provenance visually distinguishable | teal `Zap Auto-captured` vs grey `User Self-reported` chips, on input rows and in the result's "What went in" summary |
| Validation §3.5 client-side + server errors inline | whole numbers 0–200, per-row messages; server `field` paths highlight rows |
| **No-skip assumption always visible at input** | exact §3.4 note pinned under the GT card, always rendered |
| Low-count guidance (soft, non-blocking) | §14 note appears for 1–2 GTs (input + result) |
| Ranges, never a bare point | percentile `70.7% – 91.0%`; AIR `20,612 – 67,441` (Indian digit grouping); beyond-data ends render "beyond 2,30,114 (last recorded rank)" |
| 1-GT prediction never looks as confident | low-data banner turns amber; width context line always shows "±X marks · N GTs · spread SD · Tier 1" |
| Coverage/§12 states | full/partial-top/above/partial-bottom/below messages on both range cards; branch section carries MATCHED / PARTIAL / BEYOND_LAST_CLOSING (constructive framing) / above-all-closings messaging with covered years |
| Aggregation summary | per-GT chips (value + provenance + older-attempt count), mean (median shown for comparison) |
| Data coverage chips next to numbers | "Rank mapping: official NEET PG 2025 results", "Branches: MCC counselling 2024 & 2025" |
| Methodology + limitation notes | rendered from the API's `estimate.notes` (no-skip, difficulty parity, disclaimer) — never invented client-side |
| Branch results | band filter chips with counts (Comfortable / Within range / Borderline / Aspirational, color-coded + tooltips), year filter, paginated cards (institute, branch, closing rank, year, category, quota) from `GET /predictions/:id/branches` |
| Disclaimers visible with results | §14 strings on form and result; "Historical possibility, not a guarantee" notes under branches |
| No confidence percentages | none anywhere |

### 3. Legacy retirement (spec §1/§18: "the two must never be live together")

- `client/src/pages/GtPredictor.tsx` **deleted** (hardcoded +15%…+150% uplift table retired with it).
- `/gt-predictor` → `<Navigate to="/predictor" replace />` — old links land on the one predictor.
- Legacy CRM `LoginModal`/`SignupModal` post-login redirect (previously to the visitor GT page) now goes home; the predictor uses App sign-in.
- No other references remain (verified by grep).

## Validation performed

| Check | Result |
|---|---|
| `vite build` | ✅ passes (pre-existing chunk-size warnings from unrelated image assets) |
| `tsc -b tsconfig.app.json` | ✅ my files clean (remaining errors are **pre-existing** in admin components: `ConfirmDialog`, `EditorToolbar`, `LinkPopover` — untouched by this phase; the repo's build script does not run tsc, which is why these live at HEAD) |
| `eslint` on all changed files | ✅ clean |
| Full server suite (`cd server && npm test`) | ✅ 181/181 (API contract the UI consumes is integration-tested) |
| Legacy retirement | ✅ file deleted; only remaining `/gt-predictor` reference is the redirect itself |

No automated browser test exists for this repo (no client test runner configured); the UI is validated by build/type/lint plus the integration-tested API contract it renders verbatim.

## Files

**New** — `client/src/pages/Predictor.tsx` · `client/src/lib/predictorClient.ts` · `client/src/types/predictor.ts` · this report.
**Modified** — `client/src/App.tsx` (+`/predictor` route, redirect, import swap) · `client/src/pages/Dashboard.tsx` (Rank Predictor button) · `components/auth/LoginModal.tsx` + `SignupModal.tsx` (post-login redirect → home).
**Deleted** — `client/src/pages/GtPredictor.tsx`.
**Untouched** — server/engine/data (all 181 tests green without change).

## Limitations & notes

1. **No client test runner** in the repo — UI correctness rests on the typed API contract + build/lint + the integration-tested server. Adding a component-test setup (vitest + testing-library) is a worthwhile future chore, deliberately out of Phase 8 scope.
2. **Auto-fill needs real GTs to shine** — zero Grand Tests exist today (Phase 1 audit), so the auto-fill path renders nothing for current students; manual entry + suggestions carry the flow. The moment GTs run in the app, auto-fill lights up with no further work.
3. **INI-CET hidden/disabled** until Phase 5 (M2), per spec.
4. Pre-existing tsc errors in admin components documented above — not introduced by this phase.
5. Branch display names still carry MCC's concatenated campus strings (Phase 2 open item — display-alias cleanup is a future refinement).

## Where M1 stands

Phases 0–8 are complete: data → engine → API → UI, one live predictor, every prediction persisted. **Remaining for M1: Phase 10a** — the minimal consent-based outcome-capture form (actual score/percentile/rank linked to the stored prediction), timed to the next real result window.

## Post-release fix (2026-09-20, from live user testing)

**Symptom:** first real UI test (dummy GTs + category → "Predict my range") failed with "Could not save the prediction, so it was not generated" (`PREDICTION_NOT_STORED`).

**Root cause (forensically established against the real Atlas DB):** the server process was serving HTTP with a **dead mongoose connection** — `predictions` collection + indexes existed (a boot-time connection had run), but **zero rate-limit documents** proved no write succeeded during the session (login's Mongo limiter fails open silently; quizzes are proxied to the App API; only `POST /predict` hard-requires a write, so the dead connection surfaced only there). Architecturally, nothing in the codebase ensures or re-heals the default connection before DB work: `server.js` connects only when run as main, so module-imported runs never connect, and a mid-session drop (e.g. sockets killed by machine sleep against Atlas) never recovers on demand.

**Fix (end-to-end):**
- `config/db.js` → `ensureDbConnection()`: cached-promise lazy connect; readyState fast-path; cache cleared on settle so a later drop triggers a fresh reconnect (self-healing); timeout via `MONGO_CONNECT_TIMEOUT_MS`.
- `routes/predictor.js`: a persistence gate (`requireDb`) runs before every DB-dependent predictor endpoint — resolves `true` to proceed, or responds `503 PREDICTOR_DB_UNAVAILABLE` and stops. `/gts` auto-fill stays non-blocking (connect raced against a 1.5s, properly cleared timer; self-reported echo skipped when storage is slow/down).

**Found during verification of the fix itself:** the first version of the gate resolved `undefined` on success, making the happy path return without responding (a hung request) — caught by the new regression tests and the standalone repro before delivery, corrected to an explicit boolean.

**Regression tests added** (now 20 in the API suite, 183 total): predict → drop connection → predict again must self-heal (201, both persisted); truly unreachable storage → clear 503 with `PREDICTOR_DB_UNAVAILABLE` while `/gts` auto-fill still works.

**Operational note:** restart a running dev server to pick up the fix. The same latent no-connection shape exists for older Mongo-backed routes (blogs/auth) under module-imported/serverless runs — out of predictor scope, flagged for the team.

## Post-release fix #2 (2026-09-20, same testing session)

**Symptom:** `POST /api/predictor/predict → 403 Forbidden` ("Cross-origin request rejected") from the dev UI at `localhost:5173`.

**Root cause:** the CSRF defence-in-depth guard compared the browser's `Origin` header against the request's `Host` header. That comparison is wrong behind every rewriting proxy: the Vite dev proxy (`changeOrigin: true`) rewrites `Host` to `localhost:5000` while the page is on `localhost:5173`, and in production the client's Vercel rewrite sends `/api` to the server project's domain (`eyeconic-server.vercel.app`) while the Origin is the website — so the site's own legitimate traffic was rejected as "cross-origin" in **both** environments.

**Fix:** new shared middleware `middleware/sameOrigin.js` — the Origin must be one of the site's **allowed origins** (the same allowlist CORS already uses: `ALLOWED_ORIGINS` env or the site defaults; `localhost`/`127.0.0.1` additionally allowed outside production). No Origin header (mobile app, curl, server-to-server) still passes; the HttpOnly SameSite=Lax cookie remains the primary CSRF defence. Applied to `routes/predictor.js` **and** `routes/appProxy.js` (which carried the identical latent bug for web quiz POSTs); `server.js` CORS now resolves its allowlist from the same module (single source of truth, unchanged behaviour).

**Regression tests:** dev-origin (`http://localhost:5173`) and production-origin (`https://www.eyeconicneetpg.com`) POSTs must succeed (predict + app-proxy start), foreign origin must 403. Verified by a standalone repro in both proxy shapes: `201 persisted` dev, `201 persisted` prod, `403` foreign. Full suite **185/185**.
