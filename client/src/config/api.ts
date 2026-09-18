/**
 * API base for the website's own server.
 *
 * Default is the SAME ORIGIN ('/api'):
 *  - dev: Vite dev-server proxy (vite.config.ts) forwards /api → :5000
 *  - prod: Vercel rewrite (client/vercel.json) forwards /api → server
 * Keeping browser→server traffic first-party is what lets the student
 * session cookie stay HttpOnly/SameSite=Lax end-to-end.
 * VITE_API_BASE_URL remains as an explicit override.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api';
