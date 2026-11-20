import 'dotenv/config';

import * as os from 'node:os';

import type { Express } from 'express';
import { Db, MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';

import {
  GoogleTokenVerificationUnavailableError,
  InvalidGoogleTokenError,
} from '../../../src/auth/authError';
import { AuthService } from '../../../src/auth/authService';
import {
  GoogleIdTokenVerifier,
  type GoogleTokenVerifier,
} from '../../../src/auth/googleTokenVerifier';
import { createApp } from '../../../src/index';
import { SessionDao } from '../../../src/session/sessionDao';
import { SessionService } from '../../../src/session/sessionService';
import { UserDao } from '../../../src/users/userDao';
import type { GoogleUserIdentity } from '../../../src/users/userTypes';

jest.setTimeout(30_000);

const USER_ID = new ObjectId();
const DATABASE_NAME = `eubc_auth_${new ObjectId().toHexString()}`;

let client: MongoClient;
let database: Db;
let app: Express;
let controlledGoogleApp: Express;
let sessionService: SessionService;
let sessionToken: string;
let userDao: UserDao;

class ControlledGoogleVerifier implements GoogleTokenVerifier {
  async verify(idToken: string): Promise<GoogleUserIdentity> {
    if (idToken === 'invalid-google-token') {
      throw new InvalidGoogleTokenError();
    }
    if (idToken === 'google-service-unavailable') {
      throw new GoogleTokenVerificationUnavailableError();
    }
    if (idToken === 'unexpected-google-error') {
      throw new Error('Sensitive Google failure');
    }

    return {
      googleSubject: 'controlled-google-subject',
      email: 'controlled.student@example.com',
      displayName: 'Controlled Student',
      profileImageUrl: null,
    };
  }
}

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
  controlledGoogleApp = createApp({
    authService: new AuthService(
      new ControlledGoogleVerifier(),
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

describe('Authentication endpoints — no mocks', () => {
  test('signs in through real services and persistence', async () => {
    const first = await request(controlledGoogleApp)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-controlled-token' });
    const second = await request(controlledGoogleApp)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-controlled-token' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.sessionToken).not.toBe(first.body.sessionToken);
    await expect(
      database.collection('users').countDocuments({
        googleSubject: 'controlled-google-subject',
      }),
    ).resolves.toBe(1);
    await expect(database.collection('sessions').countDocuments({}))
      .resolves.toBe(3);
  });

  test.each([
    ['invalid-google-token', 401, 'INVALID_GOOGLE_TOKEN'],
    ['google-service-unavailable', 503, 'AUTH_SERVICE_UNAVAILABLE'],
    ['unexpected-google-error', 500, 'INTERNAL_SERVER_ERROR'],
  ])(
    'maps the controlled Google failure for %s',
    async (idToken, status, errorCode) => {
      const response = await request(controlledGoogleApp)
        .post('/api/v1/auth/google')
        .send({ idToken });

      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(errorCode);
      expect(JSON.stringify(response.body)).not.toContain('Sensitive Google failure');
    },
  );

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

  test('logout requires a bearer token', async () => {
    const response = await request(app).delete('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
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

});
