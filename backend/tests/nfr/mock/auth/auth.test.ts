import express from 'express';
import {
  gaxios,
  type TokenPayload,
  type VerifyIdTokenOptions,
} from 'google-auth-library';
import request from 'supertest';

import {
  GoogleTokenVerificationUnavailableError,
  InvalidGoogleTokenError,
} from '../../../../src/auth/authError';
import {
  authenticateSession,
  requireUserOwnership,
} from '../../../../src/auth/authMiddleware';
import { AuthService } from '../../../../src/auth/authService';
import {
  GoogleIdTokenVerifier,
  type GoogleVerificationClient,
  type GoogleTokenVerifier,
} from '../../../../src/auth/googleTokenVerifier';
import { createApp } from '../../../../src/index';
import {
  ExpiredSessionError,
  InvalidSessionError,
} from '../../../../src/session/sessionError';
import type { SessionRepository } from '../../../../src/session/sessionRepository';
import { SessionService } from '../../../../src/session/sessionService';
import type { NewSession, Session } from '../../../../src/session/sessionTypes';
import type { UserRepository } from '../../../../src/users/userRepository';
import type {
  GoogleUserIdentity,
  User,
  UserPreferences,
  UserUpdate,
} from '../../../../src/users/userTypes';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const USER_ID = '6705f0000000000000000001';
const VALID_GOOGLE_TOKEN = 'valid-google-id-token';

class TestGoogleTokenVerifier implements GoogleTokenVerifier {
  async verify(idToken: string): Promise<GoogleUserIdentity> {
    if (idToken === 'google-service-unavailable') {
      throw new GoogleTokenVerificationUnavailableError();
    }

    if (idToken === 'unexpected-auth-error') {
      throw new Error('Sensitive provider failure');
    }

    if (idToken !== VALID_GOOGLE_TOKEN) {
      throw new InvalidGoogleTokenError();
    }

    return {
      googleSubject: 'google-subject-123',
      email: 'student@example.com',
      displayName: 'Student Name',
      profileImageUrl: 'https://example.com/student.jpg',
    };
  }
}

class TestUserRepository implements UserRepository {
  private user: User | null = null;

  async findOrCreateByGoogleIdentity(
    identity: GoogleUserIdentity,
  ): Promise<User> {
    if (this.user !== null) {
      return this.user;
    }

    this.user = {
      id: USER_ID,
      ...identity,
      start_location: '',
      preferences: {
        transportation: { mode: 'walking' },
        budget: 'economical',
        interest: 'food',
      },
      onboardingCompletedAt: null,
      create_at: NOW,
      updated_at: NOW,
    };
    return this.user;
  }

  async findPreferences(userId: string): Promise<UserPreferences | null> {
    return userId === this.user?.id ? this.user.preferences : null;
  }

  async findUser(userId: string): Promise<User | null> {
    return userId === this.user?.id ? this.user : null;
  }

  async updateUser(_userId: string, _update: UserUpdate): Promise<User | null> {
    return null;
  }

  removeUser(): void {
    this.user = null;
  }
}

class TestSessionRepository implements SessionRepository {
  readonly createdInputs: NewSession[] = [];
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;

  async create(session: NewSession): Promise<Session> {
    this.createdInputs.push(session);
    const stored = {
      ...session,
      id: `6705f100000000000000${String(this.nextId).padStart(4, '0')}`,
    };
    this.nextId += 1;
    this.sessions.set(session.tokenHash, stored);
    return stored;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async updateExpiryByTokenHash(
    tokenHash: string,
    expiresAt: Date,
  ): Promise<Session | null> {
    const session = this.sessions.get(tokenHash);
    if (session === undefined) return null;

    const updated = { ...session, expiresAt };
    this.sessions.set(tokenHash, updated);
    return updated;
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    return this.sessions.delete(tokenHash);
  }
}

function createTestContext(clock: () => Date = () => NOW) {
  const userRepository = new TestUserRepository();
  const sessionService = new SessionService(
    new TestSessionRepository(),
    1,
    clock,
  );
  const authService = new AuthService(
    new TestGoogleTokenVerifier(),
    userRepository,
    sessionService,
  );
  const app = createApp({
    authService,
    sessionService,
    userRepository,
  });
  return { app, userRepository };
}

function createTestApp(clock: () => Date = () => NOW) {
  return createTestContext(clock).app;
}

async function login(app: ReturnType<typeof createTestApp>) {
  return request(app)
    .post('/api/v1/auth/google')
    .send({ idToken: VALID_GOOGLE_TOKEN });
}

// NFR-AUTH-BE-1 — See documentation/Testing.md, "Secure authentication and session management".
describe('Authentication endpoints — with mocks', () => {
  test('first login creates a user and returns a session', async () => {
    const response = await login(createTestApp());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      expiresAt: '2026-10-23T12:00:00.000Z',
      user: {
        id: USER_ID,
        googleSubject: 'google-subject-123',
        email: 'student@example.com',
        displayName: 'Student Name',
        onboardingCompletedAt: null,
      },
    });
    expect(response.body.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  test('repeated login returns the existing user and a new session', async () => {
    const app = createTestApp();
    const first = await login(app);
    const second = await login(app);

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.sessionToken).not.toBe(first.body.sessionToken);
  });

  test('gets the current user, extends the session, and does not issue another token', async () => {
    let now = NOW;
    const app = createTestApp(() => now);
    const authenticated = await login(app);
    now = new Date('2026-10-22T18:00:00.000Z');

    const currentSession = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${authenticated.body.sessionToken}`);

    expect(currentSession.status).toBe(200);
    expect(currentSession.body).toMatchObject({
      expiresAt: '2026-10-23T18:00:00.000Z',
      user: { id: USER_ID, onboardingCompletedAt: null },
    });
    expect(currentSession.body).not.toHaveProperty('sessionToken');
    expect(currentSession.body.expiresAt).not.toBe(authenticated.body.expiresAt);
  });

  test.each([
    [{}, 'INVALID_REQUEST', 400],
    [{ idToken: '' }, 'INVALID_REQUEST', 400],
    [{ idToken: 'invalid-google-token' }, 'INVALID_GOOGLE_TOKEN', 401],
    [
      { idToken: 'google-service-unavailable' },
      'AUTH_SERVICE_UNAVAILABLE',
      503,
    ],
    [{ idToken: 'unexpected-auth-error' }, 'INTERNAL_SERVER_ERROR', 500],
  ])('rejects invalid login input %#', async (body, code, status) => {
    const response = await request(createTestApp())
      .post('/api/v1/auth/google')
      .send(body);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain('Sensitive provider failure');
  });

  test('revokes a session whose user no longer exists', async () => {
    const context = createTestContext();
    const authenticated = await login(context.app);
    const authorization = `Bearer ${authenticated.body.sessionToken}`;
    context.userRepository.removeUser();

    const missingUser = await request(context.app)
      .get('/api/v1/auth/session')
      .set('Authorization', authorization);
    const revoked = await request(context.app)
      .get('/api/v1/auth/session')
      .set('Authorization', authorization);

    expect(missingUser.status).toBe(401);
    expect(missingUser.body.error.code).toBe('INVALID_SESSION');
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('INVALID_SESSION');
  });

  test('logout revokes only the presented session', async () => {
    const app = createTestApp();
    const firstDevice = await login(app);
    const secondDevice = await login(app);

    const logout = await request(app)
      .delete('/api/v1/auth/session')
      .set('Authorization', `Bearer ${firstDevice.body.sessionToken}`);
    expect(logout.status).toBe(204);

    const revoked = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${firstDevice.body.sessionToken}`);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('INVALID_SESSION');

    const stillActive = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${secondDevice.body.sessionToken}`);
    expect(stillActive.status).toBe(200);
    expect(stillActive.body.user.id).toBe(USER_ID);
  });

  test.each([
    ['GET', '/api/v1/auth/session'],
    ['DELETE', '/api/v1/auth/session'],
  ])('%s %s requires a bearer token', async (method, path) => {
    const app = createTestApp();
    const response =
      method === 'GET'
        ? await request(app).get(path)
        : await request(app).delete(path);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
  });

});

{
  const CLIENT_ID = 'explore-ubc.apps.googleusercontent.com';
  const NOW = new Date('2026-10-22T12:00:00.000Z');
  const ID_TOKEN = 'secret-google-id-token';

  function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
    return {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-subject-123',
      iat: Math.floor(NOW.getTime() / 1000) - 60,
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
      email: 'student@example.com',
      name: 'Student Name',
      picture: 'https://example.com/student.jpg',
      ...overrides,
    };
  }

  function payloadWithoutExpiry(): TokenPayload {
    const { exp: _expiry, ...claims } = payload();
    return claims as TokenPayload;
  }

  function payloadWithoutProfileClaims(): TokenPayload {
    const {
      email: _email,
      name: _name,
      picture: _picture,
      ...claims
    } = payload();
    return {
      ...claims,
      aud: ['another-client', CLIENT_ID] as unknown as string,
    };
  }

  function clientReturning(claims: TokenPayload | undefined): {
    client: GoogleVerificationClient;
    verifyIdToken: jest.Mock<
      Promise<{ getPayload(): TokenPayload | undefined }>,
      [VerifyIdTokenOptions]
    >;
  } {
    const verifyIdToken = jest.fn(
      async (_options: VerifyIdTokenOptions) => ({
        getPayload: () => claims,
      }),
    );
    return { client: { verifyIdToken }, verifyIdToken };
  }

  describe('Google ID token verification', () => {
    test('returns identity from valid verified claims', async () => {
      const fake = clientReturning(payload());
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).resolves.toEqual({
        googleSubject: 'google-subject-123',
        email: 'student@example.com',
        displayName: 'Student Name',
        profileImageUrl: 'https://example.com/student.jpg',
      });
      expect(fake.verifyIdToken).toHaveBeenCalledWith({
        idToken: ID_TOKEN,
        audience: CLIENT_ID,
      });
    });

    test('accepts an audience list and defaults optional profile claims', async () => {
      const fake = clientReturning(payloadWithoutProfileClaims());
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).resolves.toEqual({
        googleSubject: 'google-subject-123',
        email: '',
        displayName: '',
        profileImageUrl: null,
      });
    });

    test('uses the system clock when no test clock is provided', async () => {
      const fake = clientReturning(
        payload({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      );
      const verifier = new GoogleIdTokenVerifier(CLIENT_ID, fake.client);

      await expect(verifier.verify(ID_TOKEN)).resolves.toMatchObject({
        googleSubject: 'google-subject-123',
      });
    });

    test('rejects an empty token before calling Google', async () => {
      const fake = clientReturning(payload());
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify('   ')).rejects.toBeInstanceOf(
        InvalidGoogleTokenError,
      );
      expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    test.each([
      ['missing payload', undefined],
      ['missing subject', payload({ sub: '' })],
      ['missing expiry', payloadWithoutExpiry()],
      ['wrong audience', payload({ aud: 'different-client-id' })],
      [
        'expired claims',
        payload({ exp: Math.floor(NOW.getTime() / 1000) - 1 }),
      ],
      ['wrong issuer', payload({ iss: 'https://attacker.example.com' })],
    ])('rejects %s', async (_caseName, claims) => {
      const fake = clientReturning(claims);
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fake.client,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).rejects.toBeInstanceOf(
        InvalidGoogleTokenError,
      );
    });

    test('hides verification details and the raw token', async () => {
      const fakeClient: GoogleVerificationClient = {
        verifyIdToken: jest.fn(async () => {
          throw new Error(`Invalid signature for ${ID_TOKEN}`);
        }),
      };
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fakeClient,
        () => NOW,
      );

      const error = await verifier
        .verify(ID_TOKEN)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(InvalidGoogleTokenError);
      expect(String(error)).not.toContain(ID_TOKEN);
      expect(String(error)).not.toContain('signature');
    });

    test('reports Google transport failures as temporarily unavailable', async () => {
      const fakeClient: GoogleVerificationClient = {
        verifyIdToken: jest.fn(async () => {
          throw new gaxios.GaxiosError('Google certificate request failed', {
            headers: new Headers(),
            url: new URL('https://www.googleapis.com/oauth2/v1/certs'),
          });
        }),
      };
      const verifier = new GoogleIdTokenVerifier(
        CLIENT_ID,
        fakeClient,
        () => NOW,
      );

      await expect(verifier.verify(ID_TOKEN)).rejects.toBeInstanceOf(
        GoogleTokenVerificationUnavailableError,
      );
    });
  });
}

{
  const NOW = new Date('2026-10-22T12:00:00.000Z');
  const USER_ID = '6705f0000000000000000001';
  const FIXED_RANDOM_BYTES = Buffer.alloc(32, 7);

  function service(
    repository: SessionRepository,
    now = NOW,
  ): SessionService {
    return new SessionService(
      repository,
      1,
      () => now,
      () => FIXED_RANDOM_BYTES,
    );
  }

  describe('Session lifecycle', () => {
    test.each([0, 1.5])('rejects invalid TTL value %s', (ttlDays) => {
      expect(
        () => new SessionService(new TestSessionRepository(), ttlDays),
      ).toThrow('Session TTL must be a positive whole number of days.');
    });

    test('creates a URL-safe token but persists only its hash', async () => {
      const repository = new TestSessionRepository();

      const created = await service(repository).createSession(USER_ID);

      expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(repository.createdInputs).toHaveLength(1);
      expect(repository.createdInputs[0]?.tokenHash).toMatch(/^[a-f\d]{64}$/u);
      expect(repository.createdInputs[0]?.tokenHash).not.toBe(created.token);
      expect(JSON.stringify(repository.createdInputs[0])).not.toContain(
        created.token,
      );
      expect(created.expiresAt).toEqual(
        new Date('2026-10-23T12:00:00.000Z'),
      );
    });

    test('resolves a valid session from its raw token', async () => {
      const repository = new TestSessionRepository();
      const sessionService = service(repository);
      const created = await sessionService.createSession(USER_ID);

      const resolved = await sessionService.validateSession(created.token);

      expect(resolved.id).toBe(created.sessionId);
      expect(resolved.userId).toBe(USER_ID);
    });

    test('extends a valid session from the current time', async () => {
      const repository = new TestSessionRepository();
      let now = NOW;
      const sessionService = new SessionService(
        repository,
        1,
        () => now,
        () => FIXED_RANDOM_BYTES,
      );
      const created = await sessionService.createSession(USER_ID);
      now = new Date('2026-10-22T18:00:00.000Z');

      const refreshed = await sessionService.refreshSession(created.token);

      expect(refreshed.expiresAt).toEqual(
        new Date('2026-10-23T18:00:00.000Z'),
      );
      expect(refreshed.createdAt).toEqual(NOW);
    });

    test('rejects refresh when the session disappears during the update', async () => {
      class VanishingSessionRepository extends TestSessionRepository {
        override async updateExpiryByTokenHash(): Promise<Session | null> {
          return null;
        }
      }

      const repository = new VanishingSessionRepository();
      const sessionService = service(repository);
      const created = await sessionService.createSession(USER_ID);

      await expect(
        sessionService.refreshSession(created.token),
      ).rejects.toBeInstanceOf(InvalidSessionError);
    });

    test('rejects an unknown or revoked session', async () => {
      const repository = new TestSessionRepository();
      const sessionService = service(repository);

      await expect(
        sessionService.validateSession('unknown'),
      ).rejects.toBeInstanceOf(InvalidSessionError);

      const created = await sessionService.createSession(USER_ID);
      await sessionService.revokeSession(created.token);
      await expect(
        sessionService.validateSession(created.token),
      ).rejects.toBeInstanceOf(InvalidSessionError);
    });

    test('rejects and removes an expired session', async () => {
      const repository = new TestSessionRepository();
      const creator = service(repository);
      const created = await creator.createSession(USER_ID);
      const afterExpiry = new Date('2026-10-23T12:00:00.001Z');

      await expect(
        service(repository, afterExpiry).validateSession(created.token),
      ).rejects.toBeInstanceOf(ExpiredSessionError);
      await expect(
        creator.validateSession(created.token),
      ).rejects.toBeInstanceOf(InvalidSessionError);
    });

    test('uses injected randomness and requests exactly 32 bytes', async () => {
      const repository = new TestSessionRepository();
      const random = jest.fn(() => FIXED_RANDOM_BYTES);
      const sessionService = new SessionService(
        repository,
        1,
        () => NOW,
        random,
      );

      await sessionService.createSession(USER_ID);

      expect(random).toHaveBeenCalledWith(32);
    });
  });
}

{
  const USER_ID = '6705f0000000000000000001';
  const OTHER_USER_ID = '6705f0000000000000000099';
  const VALID_TOKEN = 'valid-session-token';

  const sessionService = {
    async validateSession(token: string): Promise<Session> {
      if (token === 'expired-session-token') {
        throw new ExpiredSessionError();
      }
      if (token !== VALID_TOKEN) {
        throw new InvalidSessionError();
      }

      return {
        id: '6705f1000000000000000001',
        userId: USER_ID,
        tokenHash: 'test-hash',
        createdAt: new Date('2026-10-22T12:00:00.000Z'),
        expiresAt: new Date('2026-11-21T12:00:00.000Z'),
      };
    },
  };

  function createProtectedApp() {
    const app = express();
    app.get(
      '/api/v1/users/:userId/probe',
      authenticateSession(sessionService),
      requireUserOwnership,
      (req, res) => res.json({ auth: req.auth }),
    );
    return app;
  }

  function createOwnershipOnlyApp() {
    const app = express();
    app.get(
      '/api/v1/users/:userId/probe',
      requireUserOwnership,
      (_req, res) => res.sendStatus(204),
    );
    return app;
  }

  describe('Authentication and ownership middleware', () => {
    test('requires authentication context before checking ownership', async () => {
      const response = await request(createOwnershipOnlyApp()).get(
        `/api/v1/users/${USER_ID}/probe`,
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('SESSION_REQUIRED');
    });

    test.each([
      [undefined, 'SESSION_REQUIRED'],
      ['Basic credentials', 'SESSION_REQUIRED'],
      ['Bearer', 'SESSION_REQUIRED'],
      ['Bearer unknown-session-token', 'INVALID_SESSION'],
      ['Bearer expired-session-token', 'SESSION_EXPIRED'],
    ])('rejects authorization value %s', async (authorization, code) => {
      let operation = request(createProtectedApp()).get(
        `/api/v1/users/${USER_ID}/probe`,
      );
      if (authorization !== undefined) {
        operation = operation.set('Authorization', authorization);
      }

      const response = await operation;

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(code);
    });

    test('rejects a valid session for a different user', async () => {
      const response = await request(createProtectedApp())
        .get(`/api/v1/users/${OTHER_USER_ID}/probe`)
        .set('Authorization', `Bearer ${VALID_TOKEN}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    test('adds the authenticated context for the matching user', async () => {
      const response = await request(createProtectedApp())
        .get(`/api/v1/users/${USER_ID}/probe`)
        .set('Authorization', `Bearer ${VALID_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body.auth).toEqual({
        sessionId: '6705f1000000000000000001',
        userId: USER_ID,
        expiresAt: '2026-11-21T12:00:00.000Z',
      });
    });
  });
}
