import * as ratingsDb from '../../../src/review/db/ratings';
import type * as MockEnv from '../mockEnv';
import {
  api,
  type ApiReply,
  cleanUpAfterTests,
  GAME_ID,
  signIn,
  testPlayer,
  withToken,
} from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

const RATED_ID = 7;
const VALID_RATING = { rated_user_id: RATED_ID, punctuality: 5, sportsmanship: 4, skill: 3, reliability: 2, overall: 1 };

cleanUpAfterTests();

async function postRating(token: string, rating: object): Promise<ApiReply> {
  const response = await api.post(`/api/games/${GAME_ID}/ratings`).set(withToken(token))
    .send(rating);
  return response as ApiReply;
}

// Interface POST /api/games/{gameId}/ratings
describe('Mocked: POST /api/games/{gameId}/ratings', () => {
  // Mocked behavior: createRating is replaced so only the route runs
  // Input: a player rates another player in every category
  // Expected status code: 201
  // Expected behavior: createRating gets the rating with the signed in user as the rater
  // Expected output: { msg: "success" }
  test('Records a rating', async () => {
    const player = testPlayer();
    const token = signIn(player);
    const createRating = jest.spyOn(ratingsDb, 'createRating').mockResolvedValue({ ok: true });

    const response = await postRating(token, VALID_RATING);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ msg: 'success' });
    expect(createRating).toHaveBeenCalledWith(GAME_ID, player.userId, RATED_ID, {
      punctuality: 5, sportsmanship: 4, skill: 3, reliability: 2, overall: 1,
    });
  });

  // Mocked behavior: createRating is replaced to check that it's never reached
  // Input: a rating with skill left out and overall above 6
  // Expected status code: 400
  // Expected behavior: nothing is recorded
  // Expected output: { msg: "invalid_request" } with an error naming both categories
  test('Rejects missing and out of range categories', async () => {
    const token = signIn(testPlayer());
    const createRating = jest.spyOn(ratingsDb, 'createRating').mockResolvedValue({ ok: true });

    const response = await postRating(token, { ...VALID_RATING, skill: undefined, overall: 7 });

    expect(response.status).toBe(400);
    expect(response.body.msg).toBe('invalid_request');
    expect(JSON.stringify(response.body)).toContain('skill, overall');
    expect(createRating).not.toHaveBeenCalled();
  });

  // Mocked behavior: createRating reports each problem a rating can have
  // Input: a valid rating
  // Expected status code: the status of each problem
  // Expected behavior: nothing else happens
  // Expected output: the problem's msg
  test.each([
    ['not_allowed', 403, 'forbidden'],
    ['rating_closed', 403, 'rating_closed'],
    ['self', 409, 'rated_self'],
    ['player_not_found', 404, 'player_not_found'],
    ['already_rated', 409, 'already_rated'],
  ] as const)('Each problem a rating can have: %s', async (problem, status, msg) => {
    const token = signIn(testPlayer());
    jest.spyOn(ratingsDb, 'createRating').mockResolvedValue({ ok: false, problem });

    const response = await postRating(token, VALID_RATING);

    expect(response.status).toBe(status);
    expect(response.body.msg).toBe(msg);
  });

  // Mocked behavior: createRating throws, as when the database is down
  // Input: a valid rating
  // Expected status code: 500
  // Expected behavior: the error is handled and the server keeps running
  // Expected output: { msg: "server_error", error: "Could not submit your rating, try again later" }
  test('Database fails', async () => {
    const token = signIn(testPlayer());
    const createRating = jest.spyOn(ratingsDb, 'createRating').mockRejectedValue(new Error('Forced error'));

    const response = await postRating(token, VALID_RATING);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ msg: 'server_error', error: 'Could not submit your rating, try again later' });
    expect(createRating).toHaveBeenCalledTimes(1);
  });
});