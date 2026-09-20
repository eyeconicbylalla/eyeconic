const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const blogRoutes = require('./routes/blogs');
const appAuthRoutes = require('./routes/appAuth');
const appProxyRoutes = require('./routes/appProxy');
const predictorRoutes = require('./routes/predictor');
const { resolveAllowedOrigins } = require('./middleware/sameOrigin');
const { isIntegrationConfigured } = require('./config/appApi');

// Fail fast with a clear message when required secrets are missing — only
// when the server is actually started (module import stays side-effect-free
// so tests can require the app).
if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not set. Configure it in the environment before starting the server.');
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Rotate it with a strong random value.');
  }
  if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI is not set. Configure it in the environment before starting the server.');
    process.exit(1);
  }
}

const app = express();

// Vercel sits in front of the app; required for correct req.ip in limits.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());

// --- CORS allowlist -------------------------------------------------------
// Production only trusts the configured origins (default: the live website).
// Local development additionally allows localhost on any port. The allowlist
// lives in middleware/sameOrigin.js and is shared with the CSRF origin guard.
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = resolveAllowedOrigins();

function corsOriginDelegate(origin, callback) {
  // Non-browser clients (curl, server-to-server) send no Origin header.
  if (!origin) return callback(null, false);
  if (allowedOrigins.has(origin) || (!isProduction && LOCAL_DEV_ORIGIN.test(origin))) {
    return callback(null, true);
  }
  // Unknown origin: no Access-Control-Allow-Origin header is emitted,
  // so browsers refuse to expose the response.
  return callback(null, false);
}

app.use(
  cors({
    origin: corsOriginDelegate,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);

// Eyeconic App (mentorship) integration — student identity + quiz data.
// The App API (Render) stays the single source of truth; these routes proxy
// it with the student's App JWT held in an encrypted HttpOnly session.
// Degrade gracefully (503) when the integration env is not configured so
// blog/CRM deployments keep working without the new variables.
app.use('/api/app-auth', appAuthRoutes);
app.use('/api/app', appProxyRoutes);

// Rank & Branch Predictor — Phase 7 API over the Phase 3–6 engine, with
// every served prediction persisted (Phase 9 built in). Authed by the same
// App student session as the proxy surface; needs Mongo for persistence.
app.use('/api/predictor', predictorRoutes);
if (!isIntegrationConfigured()) {
  console.warn(
    'App integration not configured — set APP_API_BASE_URL, APP_INTEGRATION_TOKEN and SESSION_SECRET to enable student sign-in and quizzes.'
  );
} else {
  // dotenv loads .env once at startup — if APP_API_BASE_URL is changed, the
  // server must be restarted. Print the resolved target so mismatches (e.g.
  // a self-pointing URL) are visible in logs immediately.
  console.log(`App integration active — App API: ${require('./config/appApi').resolveAppApiBaseUrl()}`);
}

app.use((_req, res) => res.status(404).json({ msg: 'Not found' }));

// Final error handler: safe responses, useful server-side logs.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ msg: 'Invalid request body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ msg: 'Request body too large' });
  }
  console.error('[api] Unhandled error', { message: err && err.message, name: err && err.name });
  return res.status(500).json({ msg: 'Server error' });
});

const redactUri = (message) =>
  String(message || '').replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, 'mongodb:[redacted]');

// Exported for tests (supertest) — starting the listener and connecting to
// Mongo happens only when run directly.
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI is not set. Configure it in the environment before starting the server.');
    process.exit(1);
  }

  mongoose
    .connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log('MongoDB connected');
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((err) => console.error('MongoDB connection error:', redactUri(err.message)));
}
