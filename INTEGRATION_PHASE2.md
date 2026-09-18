# Phase 2 — App ↔ Website Integration

**Status: implemented and tested (18 Sep 2026).** This document describes the
production architecture of the Eyeconic Mentorship App ↔ Eyeconic Website
integration, the environment variables each deployment needs, and how the
guarantees (single source of truth, security, sync) are enforced.

```
Mobile app (EAS Android)                Website (eyeconicneetpg.com)
   Expo, scheme mentorship://             client (Vercel)  ← /api same-origin
        │  JWT {userId, role}             server (Vercel)  ← encrypted HttpOnly
        │                                       │  session + allowlisted proxy
        ▼                                       ▼
   ┌──────────────────────────────────────────────────────┐
   │  App API (Render) — SINGLE SOURCE OF TRUTH           │
   │  users · quizzes · quizattempts · grading · analytics│
   │  + /api/integration/v1/handoff/consume (service-auth)│
   └──────────────────────────────────────────────────────┘
```

## What was built

### App backend (`C:\Projects\eyeconic-app\backend`)
| Piece | File |
|---|---|
| One-time handoff codes (SHA-256 at rest, TTL index) | `models/WebHandoffCode.js` |
| `POST /api/auth/web-handoff` (user JWT → code + website URL) | `routes/auth.js` |
| `POST /api/integration/v1/handoff/consume` (service-auth → fresh user JWT) | `routes/integration.js` |
| Service-token middleware (timing-safe, ≥32 chars, 503 when unset) | `middleware/serviceAuth.js` |
| Freeze-safe `integration: true` flag + mount | `config/featureAvailability.js`, `server.js` |
| Website URL helper (env `WEBSITE_URL`, distinct from `WEB_APP_URL`) | `utils/websiteUrl.js` |
| Tests: 13 handoff cases | `tests/integration/webHandoff.test.js` |

### Mobile app (`C:\Projects\eyeconic-app`)
| Piece | File |
|---|---|
| `openWebDashboard(dest)` — mint code, open browser | `services/webDashboard.ts` (+ test) |
| Header button (globe) on the dashboard tab | `app/(tabs)/dashboard.tsx` |
| Deep links `mentorship://dashboard`, `mentorship://quizzes[/:id]` | `app/_layout.tsx`, `app.json` intent filters |

### Website server (`server/`)
| Piece | File |
|---|---|
| App API client (timeouts, error mapping, no secrets logged) | `config/appApi.js` |
| AES-256-GCM encrypted HttpOnly session cookie | `services/appSession.js` |
| `/api/app-auth/login·session·logout·handoff` | `routes/appAuth.js` |
| Allowlisted `/api/app/*` quiz proxy (student JWT attached server-side) | `routes/appProxy.js` |
| Tests: 19 mock-App + 5 REAL-backend E2E + 3 legacy | `tests/` |

### Website client (`client/src/`)
- `context/AppAuthContext.tsx`, `components/auth/StudentLoginModal.tsx`
- `pages/AppLink.tsx` (handoff landing), `Dashboard.tsx` (integrated student dashboard)
- `pages/Tests.tsx`, `TestDetail.tsx`, `TestAttempt.tsx` (web quiz player:
  server-authoritative timers, per-answer autosave, section locking, all
  question types, tab-switch logging, refresh-safe resume), `TestResults.tsx`
- `lib/appLinks.ts` + `components/app/OpenInAppButton.tsx` (website → app)
- Legacy GT predictor moved to `/gt-predictor` (unchanged behaviour); legacy
  login/signup still work there via the original localStorage-token flow.

## Guarantees

1. **Single source of truth** — every quiz, attempt, answer, score and
   analytics number is produced and stored by the App backend. The website
   server holds no quiz data; its proxy adds no authority. A submission made
   on the web is visible in the app and vice versa (covered by E2E tests).
2. **One identity** — students sign in with their app credentials. The App
   JWT never reaches browser JS: it lives inside an AES-256-GCM-encrypted
   HttpOnly cookie on the website server, which attaches it server-side.
3. **No credentials in URLs** — app → website handoff uses a single-use,
   2-minute, SHA-256-hashed code (OAuth-code semantics). Replays fail
   atomically; a new code supersedes the old one.
4. **Authorization stays server-side** — the proxy is an explicit allowlist
   of student-scoped endpoints; cross-user access and admin endpoints are
   rejected by the App backend (tested), not by the web client.
5. **Attempt integrity** — grading, timers (`durationDeadline`,
   `sectionStates[].endsAt`), duplicate-submit protection (CAS + 409) and
   idempotent submits are all enforced by the existing backend logic; the
   web player only renders state.
6. **Backward compatibility** — every pre-existing website endpoint, the
   admin/blog CMS, public-quiz flow and mobile auth are untouched; the old
   website login flow still works at `/gt-predictor`. Legacy test suite
   covers it.

## Local development (zero-config)

Outside production, both servers fall back to **local-only development
defaults** when the integration secrets are unset (loud one-time warning in
the logs; production still fails closed with 503):

- App backend: `INTEGRATION_SERVICE_TOKEN` → `dev-integration-service-token-local-only-000`
- Website server: `APP_INTEGRATION_TOKEN` → the same value; `SESSION_SECRET` → a dev secret; `APP_API_BASE_URL` → `http://localhost:3000/api`

So `npm run dev` on both servers works with no new env vars, including the
full app → website handoff. Set real values for production/Vercel/Render.

The session probe contract: `GET /api/app-auth/session` returns **200
`{user: null}`** for anonymous visitors (a probe must never be an error), and
401 only when a previously-working session was rejected by the App API.

## Environment

### App backend (Render, `eyeconic-app-prod`)
```
INTEGRATION_SERVICE_TOKEN=<43+ char random, shared with website>
WEBSITE_URL=https://www.eyeconicneetpg.com
# optional: WEB_HANDOFF_TTL_SECONDS=120, WEB_HANDOFF_MAX_PER_USER=10
```
Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

### Website server (Vercel, `eyeconic-server`)
```
APP_API_BASE_URL=https://eyeconic-app-prod-1r8o.onrender.com/api
APP_INTEGRATION_TOKEN=<same value as INTEGRATION_SERVICE_TOKEN>
SESSION_SECRET=<32+ char random, unrelated to JWT_SECRET>
```

### Website client (Vercel, `eyeconicneetpg.com`)
`client/vercel.json` rewrites `/api/*` → the server (already committed).
Dev: `VITE_DEV_API_TARGET` (default `http://localhost:5000`) for the Vite proxy.

### Mobile
No new secrets. `WEBSITE_URL` on the backend controls the handoff URL; in
development it defaults to `http://localhost:5173`.

To run everything locally:

1. App backend: `cd eyeconic-app/backend && npm run dev` (port 3000)
2. Website server: `cd server && npm run dev` (port 5000)
3. Website client: `cd client && npm run dev` (port 5173 proxies /api → :5000)

## Testing

- `cd server && npm test` — 28 tests: proxy/auth/handoff against a mock App
  API, full-flow E2E against the **real** app backend (in-memory Mongo,
  auto-skips without the sibling repo), and legacy regression.
- `cd eyeconic-app/backend && npx jest tests/integration/webHandoff.test.js`
  — handoff creation/consumption, single-use, expiry, rate limits, service
  auth.
- `cd eyeconic-app && npx jest services/__tests__/webDashboard.test.ts` —
  mobile handoff service.
- `cd client && npm run build` — type-checks the whole web client.

## Known scope decisions

- **Proctored quizzes** are app-only on the website (the web shows an
  "Open in App" card). Proctoring requires native capabilities by design.
- **Deep links use the `mentorship://` scheme** (already registered on
  Android). HTTPS App Links (assetlinks.json) can be added later without
  contract changes.
- The pre-existing `aiProctoring` flag drift (backend true / mobile false)
  belongs to the team's in-progress proctoring work and is unchanged.
