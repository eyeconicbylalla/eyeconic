# Eyeconic Backend Server

## Setup

1. Copy `.env.example` to `.env` and fill in your MongoDB URI, JWT secret, and Cloudinary credentials.
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
