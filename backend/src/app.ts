import express, { type Express } from 'express';

import { requireGoogleAuth } from './auth';
import { env } from './config/env';
import { getServerPublicIp } from './server-ip';
import { formatGmtOffsetTime } from './time';

export function createApp(): Express {
  const app = express();

  // Hand-rolled instead of the `cors` package: the app only needs to allow
  // any origin on a handful of GET routes, so a middleware dependency isn't
  // worth it for three header lines.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/server-ip', requireGoogleAuth, async (_req, res) => {
    const ip = await getServerPublicIp();
    res.json({ ip });
  });

  app.get('/api/server-time', requireGoogleAuth, (_req, res) => {
    res.json({ time: formatGmtOffsetTime(new Date()) });
  });

  app.get('/api/name', requireGoogleAuth, (_req, res) => {
    res.json({ first: env.developerFirstName, last: env.developerLastName });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
