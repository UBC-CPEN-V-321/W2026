import request from 'supertest';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({ sub: 'mock-user', email: 'mock@example.com' }),
    }),
  })),
}));

import { createApp } from '../../src/app';

// Interface GET /api/server-ip
describe('Mocked: GET /api/server-ip', () => {
  // Input: GET request to /api/server-ip with a valid (mocked) Google ID token
  // Mocked behavior: OAuth2Client.verifyIdToken resolves successfully
  // Expected status code: 200
  // Expected output: { ip: string }
  test('Returns server IP when token is valid', async () => {
    const response = await request(createApp())
      .get('/api/server-ip')
      .set('Authorization', 'Bearer mock-valid-token');

    expect(response.status).toBe(200);
    expect(typeof response.body.ip).toBe('string');
  });
});

// Interface GET /api/server-time
describe('Mocked: GET /api/server-time', () => {
  // Input: GET request to /api/server-time with a valid (mocked) Google ID token
  // Mocked behavior: OAuth2Client.verifyIdToken resolves successfully
  // Expected status code: 200
  // Expected output: { time: string }
  test('Returns server time when token is valid', async () => {
    const response = await request(createApp())
      .get('/api/server-time')
      .set('Authorization', 'Bearer mock-valid-token');

    expect(response.status).toBe(200);
    expect(response.body.time).toMatch(/^\d{2}:\d{2}:\d{2} GMT[+-]\d{2}:\d{2}$/);
  });
});

// Interface GET /api/name
describe('Mocked: GET /api/name', () => {
  // Input: GET request to /api/name with a valid (mocked) Google ID token
  // Mocked behavior: OAuth2Client.verifyIdToken resolves successfully
  // Expected status code: 200
  // Expected output: { first: string, last: string }
  test('Returns developer name when token is valid', async () => {
    const response = await request(createApp())
      .get('/api/name')
      .set('Authorization', 'Bearer mock-valid-token');

    expect(response.status).toBe(200);
    expect(typeof response.body.first).toBe('string');
    expect(typeof response.body.last).toBe('string');
  });
});
