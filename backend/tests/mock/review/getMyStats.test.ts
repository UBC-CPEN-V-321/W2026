import request from 'supertest';

import { createApp } from '../../../src/app';
import * as reputationDb from '../../../src/review/db/reputation';
import type * as MockEnv from '../mockEnv';
import { api, cleanUpAfterTests, signIn, testPlayer, withToken } from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

cleanUpAfterTests();

// Interface GET /api/users/me/stats
describe('Mocked: GET /api/users/me/stats', () => {
  // Mocked behavior: getReputationScore is replaced so only the route runs
  // Input: a signed in player asks for their stats
  // Expected status code: 200
  // Expected behavior: the score is looked up for the signed in user
  // Expected output: { msg: "success", reputation_score }
  test('Returns the signed in user\'s score', async () => {
    const player = testPlayer();
    const token = signIn(player);
    const getReputationScore = jest.spyOn(reputationDb, 'getReputationScore').mockResolvedValue(4.2);

    const response = await api.get('/api/users/me/stats').set(withToken(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ msg: 'success', reputation_score: 4.2 });
    expect(getReputationScore).toHaveBeenCalledWith(player.userId);
  });

  // Mocked behavior: none, the request is refused before any lookup
  // Input: no sign in
  // Expected status code: 400 or above, requireAuth refuses it
  // Expected behavior: no score is read
  // Expected output: an error
  test('Needs a signed in user', async () => {
    const getReputationScore = jest.spyOn(reputationDb, 'getReputationScore').mockResolvedValue(4.2);

    const response = await request(createApp()).get('/api/users/me/stats');

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(getReputationScore).not.toHaveBeenCalled();
  });

  // Mocked behavior: getReputationScore throws, as when the database is down
  // Input: a signed in player asks for their stats
  // Expected status code: 500
  // Expected behavior: the error is handled and the server keeps running
  // Expected output: { msg: "server_error", error: "Could not load your rating, try again later" }
  test('Database fails', async () => {
    const token = signIn(testPlayer());
    const getReputationScore = jest.spyOn(reputationDb, 'getReputationScore')
      .mockRejectedValue(new Error('Forced error'));

    const response = await api.get('/api/users/me/stats').set(withToken(token));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ msg: 'server_error', error: 'Could not load your rating, try again later' });
    expect(getReputationScore).toHaveBeenCalledTimes(1);
  });
});