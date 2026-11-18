import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase, SessionModel, UserModel } from '../../src/userStore';
import { registerAccount } from '../helpers/registration';

// The real Google verifier and MongoDB stores. No mocked components: a forged token must fail verification.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
const originalClientId = process.env.GOOGLE_CLIENT_ID;
const credentials = { username: 'joy_tao', password: 'long password', confirmPassword: 'long password' };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('google-auth-test'));
}, 120000);
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
  app = createApp();
});
afterEach(async () => { await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]); });
afterAll(async () => {
  if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = originalClientId;
  await disconnectDatabase();
  await mongo.stop();
}, 30000);

// Interface POST /api/auth/google
describe('Unmocked: POST /api/auth/google', () => {
  // Input: a token that is not a Google-signed JWT
  // Expected status code: 401
  // Expected behavior: the real verifier rejects it; no account or session is created
  // Expected output: error message
  test('Rejects a forged ID token', async () => {
    const res = await request(app).post('/api/auth/google').send({ idToken: 'forged.token.value' });
    expect(res.status).toBe(401);
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  // Input: valid-looking token while GOOGLE_CLIENT_ID is not configured
  // Expected status code: 503
  // Expected behavior: Google sign-in reports that it is unavailable without calling Google
  // Expected output: error message
  test('Reports missing OAuth configuration', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(app).post('/api/auth/google').send({ idToken: 'forged.token.value' });
    expect(res.status).toBe(503);
    expect(await UserModel.countDocuments()).toBe(0);
  });
});

// Interface POST /api/auth/google/register
describe('Unmocked: POST /api/auth/google/register', () => {
  // Input: forged ID token with a valid username, password and confirmation
  // Expected status code: 401
  // Expected behavior: no account is created without a verified Google identity
  // Expected output: error message
  test('Rejects a forged ID token without creating an account', async () => {
    const res = await request(app).post('/api/auth/google/register').send({ idToken: 'forged.token.value', ...credentials });
    expect(res.status).toBe(401);
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await SessionModel.countDocuments()).toBe(0);
  });
});

// Interface POST /api/auth/google/link
describe('Unmocked: POST /api/auth/google/link', () => {
  // Input: forged ID token with the correct username and password of an existing account
  // Expected status code: 401
  // Expected behavior: the stored account keeps no Google identity; no new session is created
  // Expected output: error message
  test('Rejects a forged ID token without linking', async () => {
    await registerAccount(app, credentials);
    const res = await request(app).post('/api/auth/google/link').send({ idToken: 'forged.token.value', ...credentials });
    expect(res.status).toBe(401);
    expect((await UserModel.findOne({ username: 'joy_tao' }).lean())?.googleId).toBeUndefined();
    expect(await SessionModel.countDocuments()).toBe(1);
  });
});
