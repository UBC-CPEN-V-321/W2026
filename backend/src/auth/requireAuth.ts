import { type Request, type Response, type NextFunction } from 'express';
import { verifyAccessToken } from './tokens';
import { AppError, type ErrorDefinition } from '../errors';

// Add userId to the request object on every route behind requireAuth
declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

const BEARER_PREFIX = 'Bearer ';

export const authErrors = {
  MissingToken: { status: 401, code: 'MISSING_AUTH_TOKEN', message: 'Missing auth token' },
  InvalidToken: { status: 401, code: 'INVALID_AUTH_TOKEN', message: 'Invalid or expired auth token' },
} satisfies Record<string, ErrorDefinition>;

/**
 * Rejects requests without a valid access token before they reach the controllers
 * and puts the caller's user id on req.userId
 *
 * @param req expects `Authorization: Bearer <access token>`
 * @param _res unused, a rejected request is sent by errorHandler
 * @param next runs the route handler once the user is known
 * @throws AppError 401 if the token is missing, invalid or expired
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  // Extract the token from the Authorization header
  const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
  if (!token) {
    throw new AppError(authErrors.MissingToken);
  }

  // Verify if the token is valid
  const userId = verifyAccessToken(token);
  if (!userId) {
    throw new AppError(authErrors.InvalidToken);
  }

  // Add the user id to the request object
  req.userId = userId;

  next();
}

/**
 * Gets the caller's user id in a route behind requireAuth
 * @param req the request requireAuth let through
 * @returns the caller's user id
 * @throws AppError 401 if the route is not behind requireAuth
 */
export function authedUserId(req: Request): string {
  if (!req.userId) {
    throw new AppError(authErrors.MissingToken);
  }
  return req.userId;
}
