import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';

import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const hasSslConfig =
  env.sslCertPath !== undefined &&
  env.sslCertPath !== '' &&
  env.sslKeyPath !== undefined &&
  env.sslKeyPath !== '';

const server = hasSslConfig
  ? createHttpsServer(
      {
        cert: readFileSync(env.sslCertPath as string),
        key: readFileSync(env.sslKeyPath as string),
      },
      app
    ).listen(env.port, () => {
      console.log(`HTTPS server listening on port ${env.port}`);
    })
  : app.listen(env.port, () => {
      console.log(`HTTP server listening on port ${env.port}`);
    });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
