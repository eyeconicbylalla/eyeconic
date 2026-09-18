/**
 * Backward compatibility: the website's original (marketing/CRM) auth and
 * dashboard keep working unchanged after the App integration was added.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let app;
let mongoServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'legacy-jwt-secret-0123456789abcdef';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'legacy-session-secret-0123456789abcdef';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = require('../server');
});

afterAll(async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  if (mongoServer) await mongoServer.stop();
});

describe('Legacy website auth (unchanged)', () => {
  const email = `lead-${Date.now()}@example.com`;

  it('signup → dashboard → gt-score still work with the localStorage-token flow', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Legacy Lead',
      email,
      phone: '+919999999999',
      password: 'secret123',
    });
    expect(signup.status).toBe(200);
    expect(typeof signup.body.token).toBe('string');
    const token = signup.body.token;

    const dashboard = await request(app)
      .get('/api/auth/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.email).toBe(email);
    expect(dashboard.body.password).toBeUndefined();

    const gt = await request(app)
      .post('/api/auth/gt-score')
      .set('Authorization', `Bearer ${token}`)
      .send({ current: 100, time: '3 Months', predicted: 125 });
    expect(gt.status).toBe(200);
    expect(gt.body.gtScore.predicted).toBe(125);

    const stale = await request(app).get('/api/auth/dashboard');
    expect(stale.status).toBe(401);
  });

  it('login rejects wrong credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(response.status).toBe(400);
  });

  it('still mounts the cron + blogs surface', async () => {
    const cron = await request(app).get('/api/auth/cronn');
    expect(cron.status).toBe(200);

    const blogs = await request(app).get('/api/blogs');
    // Route exists and answers (200 with list or empty structure) — not 404.
    expect(blogs.status).not.toBe(404);
  });
});
