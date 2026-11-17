import 'dotenv/config';

import { createHash } from 'node:crypto';
import * as os from 'node:os';

import type { Express } from 'express';
import { Db, MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';

import { AuthService } from '../../../../src/auth/authService';
import { GoogleIdTokenVerifier } from '../../../../src/auth/googleTokenVerifier';
import { createApp } from '../../../../src/index';
import { SessionDao } from '../../../../src/session/sessionDao';
import { SessionService } from '../../../../src/session/sessionService';
import { UserDao } from '../../../../src/users/userDao';

jest.setTimeout(30_000);

const USER_ID = new ObjectId();
const OTHER_USER_ID = new ObjectId();
const DATABASE_NAME = `eubc_auth_${new ObjectId().toHexString()}`;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

let client: MongoClient;
let database: Db;
let app: Express;
let sessionService: SessionService;
let sessionToken: string;
let userDao: UserDao;

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined || uri.trim() === '') {
    throw new Error('MONGODB_URI is required for no-mock tests.');
  }

  client = new MongoClient(uri, {
    runtimeAdapters: { os },
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();
  database = client.db(DATABASE_NAME);

  userDao = new UserDao(database);
  sessionService = new SessionService(new SessionDao(database), 1);
  app = createApp({
    authService: new AuthService(
      new GoogleIdTokenVerifier('test.apps.googleusercontent.com'),
      userDao,
      sessionService,
    ),
    sessionService,
    userRepository: userDao,
  });
});

beforeEach(async () => {
  await database.collection('sessions').deleteMany({});
  await database.collection('users').deleteMany({});
  await database.collection('users').insertOne({
    _id: USER_ID,
    googleSubject: 'google-subject-123',
    email: 'student@example.com',
    displayName: 'Student Name',
    profileImageUrl: null,
    start_location: 'UBC Bus Exchange',
    preferences: {
      transportation: { mode: 'walking' },
      budget: 'economical',
      interest: 'food',
    },
    onboardingCompletedAt: new Date('2026-11-01T12:00:00.000Z'),
    create_at: new Date('2026-11-01T12:00:00.000Z'),
    updated_at: new Date('2026-11-01T12:00:00.000Z'),
  });

  const session = await sessionService.createSession(USER_ID.toHexString());
  sessionToken = session.token;
});

afterAll(async () => {
  await database.dropDatabase();
  await client.close();
});

// NFR-AUTH-BE-2 — See documentation/Testing.md, "Secure authentication and session management".
describe('Authentication endpoints — no mocks', () => {
  test('creates a first-time Google user once with onboarding defaults', async () => {
    await database.collection('users').deleteMany({});
    const identity = {
      googleSubject: 'new-google-subject',
      email: 'new.student@example.com',
      displayName: 'New Student',
      profileImageUrl: 'https://example.com/new-student.jpg',
    };

    const created = await userDao.findOrCreateByGoogleIdentity(identity);
    const existing = await userDao.findOrCreateByGoogleIdentity({
      ...identity,
      displayName: 'Changed Google Name',
    });

    expect(created).toMatchObject({
      ...identity,
      start_location: '',
      preferences: {
        transportation: { mode: 'walking' },
        budget: 'economical',
        interest: 'food',
      },
      onboardingCompletedAt: null,
    });
    expect(existing.id).toBe(created.id);
    expect(existing.displayName).toBe('New Student');
    await expect(
      database.collection('users').countDocuments({
        googleSubject: identity.googleSubject,
      }),
    ).resolves.toBe(1);
  });

  test('restores the current user and rolls the persisted expiry forward by one day', async () => {
    const earliestExpiry = Date.now() + MILLISECONDS_PER_DAY;

    const response = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      onboardingRequired: false,
      user: {
        id: USER_ID.toHexString(),
        email: 'student@example.com',
      },
    });
    expect(response.body).not.toHaveProperty('sessionToken');
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThanOrEqual(
      earliestExpiry,
    );

    const storedSession = await database.collection('sessions').findOne({});
    expect(storedSession?.expiresAt.toISOString()).toBe(response.body.expiresAt);
    expect(storedSession?.tokenHash).not.toBe(sessionToken);
    expect(JSON.stringify(storedSession)).not.toContain(sessionToken);
  });

  test('logout removes the presented session and makes it unusable', async () => {
    const logout = await request(app)
      .delete('/api/v1/auth/session')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(logout.status).toBe(204);
    await expect(database.collection('sessions').countDocuments({}))
      .resolves.toBe(0);

    const restored = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(restored.status).toBe(401);
    expect(restored.body.error.code).toBe('INVALID_SESSION');
  });

  test.each(['GET', 'DELETE'])(
    '%s /api/v1/auth/session rejects a missing bearer token',
    async (method) => {
      const response = method === 'GET'
        ? await request(app).get('/api/v1/auth/session')
        : await request(app).delete('/api/v1/auth/session');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('SESSION_REQUIRED');
    },
  );

  test('expired sessions are rejected and removed from MongoDB', async () => {
    const expiredToken = 'expired-session-token';
    await database.collection('sessions').deleteMany({});
    await database.collection('sessions').insertOne({
      _id: new ObjectId(),
      userId: USER_ID,
      tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
      createdAt: new Date(Date.now() - 2 * MILLISECONDS_PER_DAY),
      expiresAt: new Date(Date.now() - MILLISECONDS_PER_DAY),
    });

    const response = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
    await expect(database.collection('sessions').countDocuments({}))
      .resolves.toBe(0);
  });

  test('rejects malformed Google authentication input before persistence', async () => {
    const sessionsBefore = await database.collection('sessions').countDocuments({});

    const response = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
    await expect(database.collection('sessions').countDocuments({}))
      .resolves.toBe(sessionsBefore);
  });

  test('allows only the user identified by the session to access a user route', async () => {
    const ownProfile = await request(app)
      .get(`/api/v1/users/${USER_ID.toHexString()}`)
      .set('Authorization', `Bearer ${sessionToken}`);
    const otherProfile = await request(app)
      .get(`/api/v1/users/${OTHER_USER_ID.toHexString()}`)
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(ownProfile.status).toBe(200);
    expect(otherProfile.status).toBe(403);
    expect(otherProfile.body.error.code).toBe('FORBIDDEN');
  });
});
