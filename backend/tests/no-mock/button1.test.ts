import request from 'supertest';

import { createApp } from '../../src/app';

// Interface GET /api/server-ip
describe('Unmocked: GET /api/server-ip', () => {
  // Input: GET request to /api/server-ip
  // Expected status code: 200
  // Expected behavior: responds with the configured/looked-up server IP
  // Expected output: { ip: string }
  test('Returns server IP', async () => {
    const response = await request(createApp()).get('/api/server-ip');

    expect(response.status).toBe(200);
    expect(typeof response.body.ip).toBe('string');
  });
});

// Interface GET /api/server-time
describe('Unmocked: GET /api/server-time', () => {
  // Input: GET request to /api/server-time
  // Expected status code: 200
  // Expected behavior: responds with the current time formatted hh:mm:ss GMT+hh:mm
  // Expected output: { time: string }
  test('Returns formatted server time', async () => {
    const response = await request(createApp()).get('/api/server-time');

    expect(response.status).toBe(200);
    expect(response.body.time).toMatch(/^\d{2}:\d{2}:\d{2} GMT[+-]\d{2}:\d{2}$/);
  });
});

// Interface GET /api/name
describe('Unmocked: GET /api/name', () => {
  // Input: GET request to /api/name
  // Expected status code: 200
  // Expected behavior: responds with the developer's configured first/last name
  // Expected output: { first: string, last: string }
  test('Returns developer name', async () => {
    const response = await request(createApp()).get('/api/name');

    expect(response.status).toBe(200);
    expect(typeof response.body.first).toBe('string');
    expect(typeof response.body.last).toBe('string');
  });
});
