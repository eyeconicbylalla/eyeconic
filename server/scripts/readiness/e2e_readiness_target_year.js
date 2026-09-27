'use strict';

/**
 * Readiness target-year E2E harness (Feature 09 addendum — target-exam
 * selection): boots the REAL website server on :5010 against a mock App API
 * and an in-memory Mongo, then idles so a browser driver (Playwright) can
 * exercise the /readiness flow through the real UI — the same wiring the
 * jest API suite uses (tests/predictorReadinessApi.test.js), but with a
 * listening socket for full-stack verification.
 *
 * Usage:   node scripts/readiness/e2e_readiness_target_year.js
 * Prints:  E2E READY (server :5010, mock app-api :5011, vite target http://127.0.0.1:5010)
 * Stop:    Ctrl+C (SIGINT tears Mongo down cleanly).
 *
 * Login credentials for the browser flow:
 *   email e2e-readiness@example.com / password correct-password
 */

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const WEBSITE_PORT = 5010;
const MOCK_APP_PORT = 5011;

const E2E_USER = {
  _id: '507f1f77bcf86cd7994390aa',
  name: 'E2E Readiness Student',
  email: 'e2e-readiness@example.com',
  role: 'student',
  isFreeUser: false,
};

function startMockAppApi() {
  return new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());
    mock.post('/auth/login', (req, res) => {
      const { email, password } = req.body || {};
      if (email === E2E_USER.email && password === 'correct-password') {
        return res.json({ token: 'app-user-jwt-for-e2e', user: E2E_USER, linkedAttempts: 0 });
      }
      return res.status(400).json({ message: 'Invalid email or password.' });
    });
    // Everything else (e.g. /predictor/gts upstreams) 404s — the client
    // surfaces degrade silently by design (no auto-fill rows).
    return mock.listen(MOCK_APP_PORT, '127.0.0.1', () => resolve());
  });
}

(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e'.repeat(40);
  process.env.SESSION_SECRET = 'e2e-session-secret-'.padEnd(40, 'x');
  process.env.APP_INTEGRATION_TOKEN = 't'.repeat(43);
  process.env.APP_LOGIN_MAX_PER_IP = '500';
  process.env.MONGO_URI = process.env.E2E_MONGO_URI || ''; // set below

  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  await startMockAppApi();
  // No /api suffix: callAppApi() appends the bare route path to this base
  // (same convention as the jest mock in tests/predictorReadinessApi.test.js).
  process.env.APP_API_BASE_URL = `http://127.0.0.1:${MOCK_APP_PORT}`;

  const app = require('../../server'); // the real Express app (module.exports)
  const server = app.listen(WEBSITE_PORT, '127.0.0.1', () => {
    console.log(`E2E READY (server :${WEBSITE_PORT}, mock app-api :${MOCK_APP_PORT}, vite target http://127.0.0.1:${WEBSITE_PORT})`);
    console.log(`login: ${E2E_USER.email} / correct-password`);
  });

  const teardown = async () => {
    server.close();
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.connection.close().catch(() => {});
    await mongoServer.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', teardown);
  process.on('SIGTERM', teardown);
})().catch((err) => {
  console.error('E2E HARNESS FAILED TO BOOT:', err && err.stack ? err.stack : err);
  process.exit(1);
});
