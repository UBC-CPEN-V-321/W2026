import type { Express } from 'express';
import type { Db } from 'mongodb';
import request, { type Test } from 'supertest';

import { SessionDao } from '../../src/session/sessionDao';
import { SessionService } from '../../src/session/sessionService';

type SessionValidator = Pick<SessionService, 'validateSession'>;
type TokenResolver = (userId: string) => string | undefined;

const TEST_SESSION_ID = '6705f2000000000000000001';

/**
 * Keeps feature-router mock tests focused on their feature. The bearer token is
 * the user ID encoded in the request path, so ownership middleware still runs.
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
