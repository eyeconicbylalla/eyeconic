# Eyeconic Backend Server

## Setup

1. Copy `.env.example` to `.env` and fill in your MongoDB URI, JWT secret, admin credentials, and Cloudinary credentials.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server (with auto-reload):
   ```bash
   npm run dev
   ```
   Or for production:
   ```bash
   npm start
   ```

## Authentication

### Students (users)

`POST /api/auth/signup` and `POST /api/auth/login` return a 7-day JWT
(`{ user: { id } }`). Protected endpoints (`GET /api/auth/dashboard`,
`POST /api/auth/gt-score`) require it as `Authorization: Bearer <token>`.

### Admin

Admin credentials are configured **only** through server-side environment
variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). They are never hardcoded in
source, never shipped to the frontend, and never accepted via URLs or
query strings.

1. `POST /api/auth/admin/login` with `{ email, password }` returns a
   short-lived admin JWT (`{ role: 'admin' }`, default 8h — configure with
   `ADMIN_TOKEN_EXPIRES`).
2. Every `/admin` endpoint (auth + blogs CMS) requires
   `Authorization: Bearer <admin-token>`.

Responses: no token → `401`, valid token without the admin role → `403`,
admin login is not configured → `503`. Login attempts are rate limited.

### Email OTP

OTPs are stored in MongoDB (bcrypt-hashed, never plaintext), expire after
10 minutes (`OTP_TTL_MINUTES`), are single-use, allow at most 5 wrong
verifications, and are rate limited per email and per IP. This works on
serverless (Vercel) because no process memory is involved.

## CORS

Browser origins are allowlisted. Set `ALLOWED_ORIGINS` (comma-separated)
in the environment; when unset it defaults to the production website.
Localhost origins (any port) are allowed automatically outside production.

## App integration (students + quizzes)

Students authenticate with their **Eyeconic Mentorship app account**; the App
API on Render remains the single source of truth. The website server proxies
it, holding the student's App JWT inside an AES-256-GCM encrypted HttpOnly
session cookie (never exposed to browser JS).

Required env (see `../INTEGRATION_PHASE2.md` for the full architecture):

- `APP_API_BASE_URL` — App API base (default `http://localhost:3000/api` outside production)
- `APP_INTEGRATION_TOKEN` — shared service token, mirrored as `INTEGRATION_SERVICE_TOKEN` on the App backend
- `SESSION_SECRET` — 32+ chars, encrypts the session cookie

### Local development — the App backend must be running

Every `/api/app/*` route proxies the App backend (the sibling `eyeconic-app`
repo). Starting only this server and the client works, but the dashboard
answers **503 `APP_UNAVAILABLE` on every card** until the App backend runs:

```powershell
# Full stack (App backend :3000, this server :5000, client :5173):
powershell -ExecutionPolicy Bypass -File scripts\dev-all.ps1

# Or the App backend alone:
cd ..\eyeconic-app\backend
npm run dev
```

dev-all.ps1 verifies each port with an HTTP signature probe and errors loudly
if a foreign process holds it; the client (`vite.config.ts` `strictPort`)
fails instead of silently moving to :5174. On boot (outside production), this
server probes the local App API once and prints a warning with the fix if it
is unreachable.

For local app → website handoff (`POST /api/app-auth/handoff`), the tokens
must mirror like in production: set `INTEGRATION_SERVICE_TOKEN` in
`eyeconic-app/backend/.env` to the same value as this server's
`APP_INTEGRATION_TOKEN` (otherwise the local backend only accepts the
dev-default token and handoff returns 503).

Endpoints:

- `POST /api/app-auth/login` — student login (sets HttpOnly session)
- `GET  /api/app-auth/session` — current student (401 when expired)
- `POST /api/app-auth/logout` — clear session
- `POST /api/app-auth/handoff` — exchange the mobile app's one-time code
  (minted by the App API's `POST /api/auth/web-handoff`) for a session
- `GET|POST /api/app/*` — allowlisted proxy to student-scoped App endpoints
  (quiz list/detail, attempt start/answer/section/submit/status, results,
  retest, `/analytics/me`). Attempt-state and answer writes are never cached.

Tests: `npm test` (mock App API + a full E2E run against the real backend in
`../eyeconic-app`, plus legacy regressions).

## Blog media uploads

Blog image uploads use **Cloudinary** in production (folder: `bm-blog` by default). Required environment variables:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` (optional, defaults to `bm-blog`)

**Why Cloudinary is required on Vercel:** the previous implementation sent base64 JSON payloads to the API. Vercel serverless functions reject request bodies above ~4.5MB (`413 FUNCTION_PAYLOAD_TOO_LARGE`), which caused real image uploads to fail.

**Local development:** if Cloudinary is not configured, the API accepts multipart uploads up to 3MB and stores them inline in MongoDB for testing only.

**Frontend API URL:** set `VITE_API_BASE_URL=http://localhost:5000/api` in `client/.env.local` for local dev, or rely on the built-in dev default.

## API Endpoints

- `POST /api/auth/signup` — Register a new user
- `POST /api/auth/login` — Login and receive JWT
- `GET /api/auth/dashboard` — Get student dashboard (JWT required in Authorization header)
- `POST /api/auth/admin/login` — Exchange admin credentials for an admin JWT
- `POST /api/auth/admin` — List students (admin JWT required)
- `PATCH /api/auth/admin/student/:id` — Update student info (admin JWT required)
- `DELETE /api/auth/admin/student/:id` — Delete student (admin JWT required)
- `POST /api/auth/send-email-otp` — Send a hashed, expiring OTP (rate limited)
- `POST /api/auth/verify-email-otp` — Verify an OTP (single-use, attempt-capped)
