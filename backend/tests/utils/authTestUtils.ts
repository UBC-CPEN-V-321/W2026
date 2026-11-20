import type { Express } from 'express';
import type { Db } from 'mongodb';
import request, { type Test } from 'supertest';

import {
  GoogleTokenVerificationUnavailableError,
  InvalidGoogleTokenError,
} from '../../src/auth/authError';
import { AuthService } from '../../src/auth/authService';
import type { GoogleTokenVerifier } from '../../src/auth/googleTokenVerifier';
import { createApp } from '../../src/index';
import { SessionDao } from '../../src/session/sessionDao';
import type { SessionRepository } from '../../src/session/sessionRepository';
import { SessionService } from '../../src/session/sessionService';
import type { NewSession, Session } from '../../src/session/sessionTypes';
import type { UserRepository } from '../../src/users/userRepository';
import type {
  GoogleUserIdentity,
  User,
  UserPreferences,
  UserUpdate,
} from '../../src/users/userTypes';

type SessionValidator = Pick<SessionService, 'validateSession'>;
type TokenResolver = (userId: string) => string | undefined;

const TEST_SESSION_ID = '6705f2000000000000000001';

/**
 * Feature-test helpers. These authenticate ordinary user-scoped API tests
 * without rebuilding the Google sign-in flow in every feature suite.
 */
export function createPathSessionValidator(): SessionValidator {
  return {
    validateSession: async (token: string) => ({
      id: TEST_SESSION_ID,
      userId: token,
      tokenHash: 'test-token-hash',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    }),
  };
}

/** Creates a Supertest agent that authenticates as the user in each URL. */
export function authenticatedAgent(
  app: Express,
  resolveToken: TokenResolver = (userId) => userId,
) {
  return request.agent(app).use((operation: Test) => {
    const userId = extractUserId(operation.url);
    if (userId === undefined) return;

    const token = resolveToken(userId);
    if (token !== undefined) {
      operation.set('Authorization', `Bearer ${token}`);
    }
  });
}

/** Manages real MongoDB-backed sessions for no-mock feature tests. */
export class MongoTestSessions {
  readonly service: SessionService;
  private readonly tokens = new Map<string, string>();

  constructor(private readonly database: Db) {
    this.service = new SessionService(new SessionDao(database), 1);
  }

  async reset(userIds: string[]): Promise<void> {
    await this.database.collection('sessions').deleteMany({});
    this.tokens.clear();

    for (const userId of new Set(userIds)) {
      const session = await this.service.createSession(userId);
      this.tokens.set(userId, session.token);
    }
  }

  tokenFor(userId: string): string | undefined {
    return this.tokens.get(userId);
  }
}

function extractUserId(url: string): string | undefined {
  const path = new URL(url, 'http://test.local').pathname;
  const match = /^\/api\/v1\/users\/([^/]+)/u.exec(path);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

/**
 * Authentication-test fixture. Unlike the feature helpers above, this builds
 * the complete auth router with controlled Google, user, and session stores.
 */
export const AUTH_TEST_NOW = new Date('2026-10-22T12:00:00.000Z');
export const AUTH_TEST_USER_ID = '6705f0000000000000000001';
export const VALID_GOOGLE_TOKEN = 'valid-google-id-token';

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
    if (this.user !== null) return this.user;

    this.user = {
      id: AUTH_TEST_USER_ID,
      ...identity,
      start_location: '',
      preferences: {
        transportation: { mode: 'walking' },
        budget: 'economical',
        interest: 'food',
      },
      onboardingCompletedAt: null,
      create_at: AUTH_TEST_NOW,
      updated_at: AUTH_TEST_NOW,
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

export class TestSessionRepository implements SessionRepository {
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

export function createAuthTestContext(
  clock: () => Date = () => AUTH_TEST_NOW,
) {
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
  const app = createApp({ authService, sessionService, userRepository });
  return { app, userRepository };
}

export function createAuthTestApp(
  clock: () => Date = () => AUTH_TEST_NOW,
) {
  return createAuthTestContext(clock).app;
}

export async function login(app: ReturnType<typeof createAuthTestApp>) {
  return request(app)
    .post('/api/v1/auth/google')
    .send({ idToken: VALID_GOOGLE_TOKEN });
}
