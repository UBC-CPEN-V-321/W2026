import * as gamesDb from '../../../src/game/db/games';
import * as ratingsDb from '../../../src/review/db/ratings';
import type * as MockEnv from '../mockEnv';
import { api, cleanUpAfterTests, GAME_ID, signIn, testGame, testPlayer, withToken } from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

const RATED_ID = 7;

cleanUpAfterTests();

// Interface GET /api/games/{gameId}/ratings
describe('Mocked: GET /api/games/{gameId}/ratings', () => {
  // Mocked behavior: the game and the players to rate are replaced
  // Input: a player who showed up opens the list
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the players and who was rated, with no scores anywhere in the reply
  test('Lists the players to rate without any scores', async () => {
    const token = signIn(testPlayer());
    jest.spyOn(gamesDb, 'getGameById').mockResolvedValue(testGame({ status: 'completed' }));
    jest.spyOn(ratingsDb, 'getPlayersToRate').mockResolvedValue({
      ok: true,
      players: [{ userId: RATED_ID, firstName: 'Rae', lastName: 'Rated', rated: true }],
    });

    const response = await api.get(`/api/games/${GAME_ID}/ratings`).set(withToken(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      msg: 'success',
      game_title: 'Sunday Soccer',
      organizer_id: 1,
      players: [{ user_id: RATED_ID, first_name: 'Rae', last_name: 'Rated', rated: true }],
    });
  });

  // Mocked behavior: getPlayersToRate says this user can't rate in the game
  // Input: a no-show, or anyone before the game is completed, opens the list
  // Expected status code: 403
  // Expected behavior: nothing changes
  // Expected output: { msg: "forbidden" }
  test('A no-show cannot open the list', async () => {
    const token = signIn(testPlayer());
    jest.spyOn(gamesDb, 'getGameById').mockResolvedValue(testGame({ status: 'completed' }));
    jest.spyOn(ratingsDb, 'getPlayersToRate').mockResolvedValue({ ok: false, problem: 'not_allowed' });

    const response = await api.get(`/api/games/${GAME_ID}/ratings`).set(withToken(token));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ msg: 'forbidden' });
  });

  // Mocked behavior: getPlayersToRate says rating the game has closed
  // Input: a player who showed up opens the list more than a day after the game was completed
  // Expected status code: 403
  // Expected behavior: nothing changes
  // Expected output: { msg: "rating_closed" } with an error saying rating has closed
  test('The list closes a day after the game is completed', async () => {
    const token = signIn(testPlayer());
    jest.spyOn(gamesDb, 'getGameById').mockResolvedValue(testGame({ status: 'completed' }));
    jest.spyOn(ratingsDb, 'getPlayersToRate').mockResolvedValue({ ok: false, problem: 'rating_closed' });

    const response = await api.get(`/api/games/${GAME_ID}/ratings`).set(withToken(token));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ msg: 'rating_closed', error: 'Rating for this game has closed' });
  });

  // Mocked behavior: getGameById throws, as when the database is down
  // Input: a player who showed up opens the list
  // Expected status code: 500
  // Expected behavior: the error is handled and the players are never read
  // Expected output: { msg: "server_error", error: "Could not load the players, try again later" }
  test('Database fails while reading the game', async () => {
    const token = signIn(testPlayer());
    jest.spyOn(gamesDb, 'getGameById').mockRejectedValue(new Error('Forced error'));
    const getPlayersToRate = jest.spyOn(ratingsDb, 'getPlayersToRate');

    const response = await api.get(`/api/games/${GAME_ID}/ratings`).set(withToken(token));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ msg: 'server_error', error: 'Could not load the players, try again later' });
    expect(getPlayersToRate).not.toHaveBeenCalled();
  });

  // Mocked behavior: getGameById finds the game, then getPlayersToRate throws
  // Input: a player who showed up opens the list
  // Expected status code: 500
  // Expected behavior: the error is handled and the server keeps running
  // Expected output: { msg: "server_error", error: "Could not load the players, try again later" }
  test('Database fails while reading the players', async () => {
    const token = signIn(testPlayer());
    jest.spyOn(gamesDb, 'getGameById').mockResolvedValue(testGame({ status: 'completed' }));
    const getPlayersToRate = jest.spyOn(ratingsDb, 'getPlayersToRate').mockRejectedValue(new Error('Forced error'));

    const response = await api.get(`/api/games/${GAME_ID}/ratings`).set(withToken(token));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ msg: 'server_error', error: 'Could not load the players, try again later' });
    expect(getPlayersToRate).toHaveBeenCalledTimes(1);
  });
});