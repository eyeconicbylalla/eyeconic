/**
 * Admin login gate: POST /api/auth/admin/login exchanges env-configured
 * credentials for a short-lived admin JWT; every other admin endpoint only
 * accepts that token. Guards the production failure mode where the server
 * runs without ADMIN_EMAIL/ADMIN_PASSWORD (503 "not configured") — the env
 * read happens at module load, so these must be set before requiring the app.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Test credentials — arbitrary values, they only need to be configured.
const TEST_ADMIN_EMAIL = 'admin-test@eyeconic1.com';
const TEST_ADMIN_PASSWORD = 'test-admin-password-123';

process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
process.env.ADMIN_TOKEN_EXPIRES = '1h';

let app;
let mongoServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-jwt-secret-0123456789abcdef';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = require('../server');
});

afterAll(async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  if (mongoServer) await mongoServer.stop();
});

describe('Admin login (env-configured credentials)', () => {
  it('A. correct credentials return an admin-scoped token', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe('admin');
  });

  it('accepts the configured email regardless of case/whitespace', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: `  ${TEST_ADMIN_EMAIL.toUpperCase()}  `, password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('B. wrong password is rejected with 401', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: TEST_ADMIN_EMAIL, password: 'definitely-wrong' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('C. unknown admin email is rejected with 401', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: 'nobody@eyeconic1.com', password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('E. the admin token authorizes the student list endpoint', async () => {
    const login = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
    const token = login.body.token;

    const list = await request(app)
      .post('/api/auth/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
    expect(Array.isArray(list.body.students)).toBe(true);
  });

  it('rejects the student list without a token (401)', async () => {
    const res = await request(app).post('/api/auth/admin').send({});
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/admin')
      .set('Authorization', 'Bearer not.a.realtoken')
      .send({});
    expect(res.status).toBe(401);
  });

  it('rejects a valid student JWT (no admin role) with 403', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Student User',
      email: `student-${Date.now()}@example.com`,
      phone: '+919999999998',
      password: 'secret123',
    });
    expect(signup.status).toBe(200);

    const res = await request(app)
      .post('/api/auth/admin')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('rejects an expired admin token (401)', async () => {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .post('/api/auth/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('D. Admin login without server configuration', () => {
  // config/admin.js captures ADMIN_EMAIL/ADMIN_PASSWORD at module load.
  // Loading it in an isolated registry with the vars removed reproduces
  // exactly the production state that makes /api/auth/admin/login answer
  // 503 "Admin access is not configured on the server."
  it('isAdminConfigured() is false when the env vars are missing', () => {
    jest.isolateModules(() => {
      const previous = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
      delete process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_PASSWORD;
      try {
        const { isAdminConfigured, isValidAdminCredentials } = require('../config/admin');
        expect(isAdminConfigured()).toBe(false);
        // Even the correct credentials must not validate while unconfigured.
        expect(isValidAdminCredentials(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).toBe(false);
      } finally {
        process.env.ADMIN_EMAIL = previous.email;
        process.env.ADMIN_PASSWORD = previous.password;
      }
    });
  });
});
