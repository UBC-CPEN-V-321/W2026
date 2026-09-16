import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

import { env } from './config/env';

const client = new OAuth2Client();

export async function requireGoogleAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length);

  try {
    await client.verifyIdToken({ idToken, audience: env.googleClientId });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
