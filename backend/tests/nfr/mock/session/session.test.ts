import express from 'express';
import request from 'supertest';

import {
  authenticateSession,
  requireUserOwnership,
} from '../../../../src/auth/authMiddleware';
import {
  ExpiredSessionError,
  InvalidSessionError,
} from '../../../../src/session/sessionError';
import type { SessionRepository } from '../../../../src/session/sessionRepository';
import { SessionService } from '../../../../src/session/sessionService';
import type { Session } from '../../../../src/session/sessionTypes';
import {
  AUTH_TEST_NOW,
  AUTH_TEST_USER_ID,
  createAuthTestApp,
  createAuthTestContext,
  login,
  TestSessionRepository,
} from '../../../utils/authTestUtils';

describe('Session restoration — with mocks', () => {
  test('gets the current user, extends the session, and does not issue another token', async () => {
    let now = AUTH_TEST_NOW;
    const app = createAuthTestApp(() => now);
    const authenticated = await login(app);
    now = new Date('2026-10-22T18:00:00.000Z');

    const currentSession = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${authenticated.body.sessionToken}`);

    expect(currentSession.status).toBe(200);
    expect(currentSession.body).toMatchObject({
      expiresAt: '2026-10-23T18:00:00.000Z',
      user: { id: AUTH_TEST_USER_ID },
    });
    expect(currentSession.body).not.toHaveProperty('sessionToken');
    expect(currentSession.body.expiresAt).not.toBe(authenticated.body.expiresAt);
  });

  test('revokes a session whose user no longer exists', async () => {
    const context = createAuthTestContext();
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

  test('requires a bearer token', async () => {
    const response = await request(createAuthTestApp())
      .get('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REQUIRED');
  });
});

describe('Session lifecycle — with mocks', () => {
  const fixedRandomBytes = Buffer.alloc(32, 7);

  function service(
    repository: SessionRepository,
    now = AUTH_TEST_NOW,
  ): SessionService {
    return new SessionService(
      repository,
      1,
      () => now,
      () => fixedRandomBytes,
    );
  }

  test.each([0, 1.5])('rejects invalid TTL value %s', (ttlDays) => {
    expect(
      () => new SessionService(new TestSessionRepository(), ttlDays),
    ).toThrow('Session TTL must be a positive whole number of days.');
  });

  test('creates a URL-safe token but persists only its hash', async () => {
    const repository = new TestSessionRepository();

    const created = await service(repository).createSession(AUTH_TEST_USER_ID);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(repository.createdInputs).toHaveLength(1);
    expect(repository.createdInputs[0]?.tokenHash).toMatch(/^[a-f\d]{64}$/u);
    expect(repository.createdInputs[0]?.tokenHash).not.toBe(created.token);
    expect(JSON.stringify(repository.createdInputs[0])).not.toContain(created.token);
    expect(created.expiresAt).toEqual(new Date('2026-10-23T12:00:00.000Z'));
  });

  test('resolves a valid session from its raw token', async () => {
    const repository = new TestSessionRepository();
    const sessionService = service(repository);
    const created = await sessionService.createSession(AUTH_TEST_USER_ID);

    const resolved = await sessionService.validateSession(created.token);

    expect(resolved.id).toBe(created.sessionId);
    expect(resolved.userId).toBe(AUTH_TEST_USER_ID);
  });

  test('extends a valid session from the current time', async () => {
    const repository = new TestSessionRepository();
    let now = AUTH_TEST_NOW;
    const sessionService = new SessionService(
      repository,
      1,
      () => now,
      () => fixedRandomBytes,
    );
    const created = await sessionService.createSession(AUTH_TEST_USER_ID);
    now = new Date('2026-10-22T18:00:00.000Z');

    const refreshed = await sessionService.refreshSession(created.token);

    expect(refreshed.expiresAt).toEqual(new Date('2026-10-23T18:00:00.000Z'));
    expect(refreshed.createdAt).toEqual(AUTH_TEST_NOW);
  });

  test('rejects refresh when the session disappears during the update', async () => {
    class VanishingSessionRepository extends TestSessionRepository {
      override async updateExpiryByTokenHash(): Promise<Session | null> {
        return null;
      }
    }

    const repository = new VanishingSessionRepository();
    const sessionService = service(repository);
    const created = await sessionService.createSession(AUTH_TEST_USER_ID);

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

    const created = await sessionService.createSession(AUTH_TEST_USER_ID);
    await sessionService.revokeSession(created.token);
    await expect(
      sessionService.validateSession(created.token),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  test('rejects and removes an expired session', async () => {
    const repository = new TestSessionRepository();
    const creator = service(repository);
    const created = await creator.createSession(AUTH_TEST_USER_ID);
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
    const random = jest.fn(() => fixedRandomBytes);
    const sessionService = new SessionService(
      repository,
      1,
      () => AUTH_TEST_NOW,
      random,
    );

    await sessionService.createSession(AUTH_TEST_USER_ID);

    expect(random).toHaveBeenCalledWith(32);
  });
});

describe('Authentication and ownership middleware — with mocks', () => {
  const otherUserId = '6705f0000000000000000099';
  const validToken = 'valid-session-token';
  const sessionService = {
    async validateSession(token: string): Promise<Session> {
      if (token === 'expired-session-token') throw new ExpiredSessionError();
      if (token !== validToken) throw new InvalidSessionError();

      return {
        id: '6705f1000000000000000001',
        userId: AUTH_TEST_USER_ID,
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

  test('requires authentication context before checking ownership', async () => {
    const app = express();
    app.get(
      '/api/v1/users/:userId/probe',
      requireUserOwnership,
      (_req, res) => res.sendStatus(204),
    );

    const response = await request(app).get(
      `/api/v1/users/${AUTH_TEST_USER_ID}/probe`,
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
      `/api/v1/users/${AUTH_TEST_USER_ID}/probe`,
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
      .get(`/api/v1/users/${otherUserId}/probe`)
      .set('Authorization', `Bearer ${validToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  test('adds the authenticated context for the matching user', async () => {
    const response = await request(createProtectedApp())
      .get(`/api/v1/users/${AUTH_TEST_USER_ID}/probe`)
      .set('Authorization', `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body.auth).toEqual({
      sessionId: '6705f1000000000000000001',
      userId: AUTH_TEST_USER_ID,
      expiresAt: '2026-11-21T12:00:00.000Z',
    });
  });
});
