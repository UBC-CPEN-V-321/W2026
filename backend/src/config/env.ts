import 'dotenv/config';

const rawPort = process.env.PORT;
const port =
  rawPort === undefined || rawPort === ''
    ? 3000
    : Number.parseInt(rawPort, 10);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

export const env = {
  port,
  sslCertPath: process.env.SSL_CERT_PATH,
  sslKeyPath: process.env.SSL_KEY_PATH,
  serverPublicIp: process.env.SERVER_PUBLIC_IP,
  developerFirstName: process.env.DEVELOPER_FIRST_NAME ?? '',
  developerLastName: process.env.DEVELOPER_LAST_NAME ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
} as const;
