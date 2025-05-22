# Eyeconic Backend Server

## Setup

1. Copy `.env.example` to `.env` and fill in your MongoDB URI and JWT secret.
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

## API Endpoints

- `POST /api/auth/signup` — Register a new user
- `POST /api/auth/login` — Login and receive JWT
- `GET /api/auth/dashboard` — Get student dashboard (JWT required in Authorization header)
