import 'dotenv/config';

import { createHash } from 'node:crypto';
import * as os from 'node:os';

import express, { type Express } from 'express';
import { Db, MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';

import {
  authenticateSession,
  requireUserOwnership,
} from '../../../../src/auth/authMiddleware';
import { AuthService } from '../../../../src/auth/authService';
import { GoogleIdTokenVerifier } from '../../../../src/auth/googleTokenVerifier';
import { createApp } from '../../../../src/index';
import { SessionDao } from '../../../../src/session/sessionDao';
import { SessionService } from '../../../../src/session/sessionService';
import { UserDao } from '../../../../src/users/userDao';

jest.setTimeout(30_000);

const USER_ID = new ObjectId();
const OTHER_USER_ID = new ObjectId();
const DATABASE_NAME = `eubc_session_nfr_${new ObjectId().toHexString()}`;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

let client: MongoClient;
let database: Db;
let app: Express;
let sessionService: SessionService;
let sessionToken: string;

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
  const userDao = new UserDao(database);
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
    googleSubject: 'session-nfr-google-subject',
    email: 'session.nfr@example.com',
    displayName: 'Session NFR User',
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
  sessionToken = (await sessionService.createSession(USER_ID.toHexString())).token;
});

afterAll(async () => {
  await database.dropDatabase();
  await client.close();
});

describe('Session security — no mocks', () => {
  test('rejects an invalid session TTL configuration', () => {
    expect(
      () => new SessionService(new SessionDao(database), 0),
    ).toThrow('Session TTL must be a positive whole number of days.');
  });

  test('restores the current user and rolls the persisted expiry forward by one day', async () => {
    const earliestExpiry = Date.now() + MILLISECONDS_PER_DAY;

    const response = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: {
        id: USER_ID.toHexString(),
        email: 'session.nfr@example.com',
        onboardingCompletedAt: expect.any(String),
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

  test('rejects a missing bearer token', async () => {
    const response = await request(app).get('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
  });

  test('rejects a protected request without a session', async () => {
    const protectedApp = express();
    protectedApp.get(
      '/protected',
      authenticateSession(sessionService),
      (_request, response) => response.sendStatus(204),
    );

    const response = await request(protectedApp).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
  });

  test('ownership middleware fails closed without authentication context', async () => {
    const ownershipOnlyApp = express();
    ownershipOnlyApp.get(
      '/users/:userId',
      requireUserOwnership,
      (_request, response) => response.sendStatus(204),
    );

    const response = await request(ownershipOnlyApp)
      .get(`/users/${USER_ID.toHexString()}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
  });

  test.each(['Basic credentials', 'Bearer'])(
    'rejects malformed authorization value %s',
    async (authorization) => {
      const response = await request(app)
        .get('/api/v1/auth/session')
        .set('Authorization', authorization);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('SESSION_REQUIRED');
    },
  );

  test('revokes a session when its user no longer exists', async () => {
    await database.collection('users').deleteOne({ _id: USER_ID });

    const response = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_SESSION');
    await expect(database.collection('sessions').countDocuments({}))
      .resolves.toBe(0);
  });

  test('rejects expired sessions and removes them from MongoDB', async () => {
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
