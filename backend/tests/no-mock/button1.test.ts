import request from 'supertest';

import { createApp } from '../../src/app';

// Interface GET /api/server-ip
describe('Unmocked: GET /api/server-ip', () => {
  // Input: GET request to /api/server-ip with no Authorization header
  // Expected status code: 401
  // Expected behavior: rejects unauthenticated requests
  // Expected output: { error: string }
  test('Rejects request with no Authorization header', async () => {
    const response = await request(createApp()).get('/api/server-ip');

    expect(response.status).toBe(401);
  });

  // Input: GET request to /api/server-ip with a malformed token
  // Expected status code: 401
  // Expected behavior: rejects requests with an invalid Google ID token
  // Expected output: { error: string }
  test('Rejects request with an invalid token', async () => {
    const response = await request(createApp())
      .get('/api/server-ip')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });
});

// Interface GET /api/server-time
describe('Unmocked: GET /api/server-time', () => {
  // Input: GET request to /api/server-time with no Authorization header
  // Expected status code: 401
  // Expected behavior: rejects unauthenticated requests
  // Expected output: { error: string }
  test('Rejects request with no Authorization header', async () => {
    const response = await request(createApp()).get('/api/server-time');

    expect(response.status).toBe(401);
  });
});

// Interface GET /api/name
describe('Unmocked: GET /api/name', () => {
  // Input: GET request to /api/name with no Authorization header
  // Expected status code: 401
  // Expected behavior: rejects unauthenticated requests
  // Expected output: { error: string }
  test('Rejects request with no Authorization header', async () => {
    const response = await request(createApp()).get('/api/name');

    expect(response.status).toBe(401);
  });
});
