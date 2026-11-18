import {
  addCancelledGame,
  addGame,
  addPlayer,
  addStartedGame,
  addUser,
  api,
  asUser,
  cleanUpAfterTests,
  MISSING_GAME_ID,
  withToken,
} from '../helpers';
import { addCompletedGame, addRating, removeFromPlayers, setCompletedMinutesAgo } from './reviewHelpers';

// rating closes a day (1440 minutes) after the game is marked completed
const JUST_BEFORE_CLOSING = 1439;
const JUST_AFTER_CLOSING = 1441;

const FORBIDDEN = { msg: 'forbidden', error: 'Only players who showed up to a completed game can rate in it' };

let organizerId: number;
let aliceId: number;
let benId: number;
let caraId: number;
let nedId: number;
let samId: number;

beforeEach(async () => {
  organizerId = await addUser('Olivia');
  aliceId = await addUser('Alice');
  benId = await addUser('Ben');
  caraId = await addUser('Cara');
  // marked as not showing up in the tests' games
  nedId = await addUser('Ned');
  // never in the tests' games
  samId = await addUser('Sam');
});

cleanUpAfterTests();

interface PlayerToRate {
  user_id: number;
  first_name: string;
  last_name: string;
  rated: boolean;
}

// the whole reply for the tests' game, which the organizer made, with these players
function listOf(players: PlayerToRate[]): Record<string, unknown> {
  return { msg: 'success', game_title: 'Evening Basketball', organizer_id: organizerId, players };
}

// Interface GET /api/games/{gameId}/ratings
describe('Unmocked: GET /api/games/{gameId}/ratings', () => {
  // Input: no Authorization header, then a token that isn't a real JWT
  // Expected status code: 400, then 401
  // Expected behavior: no players are read
  // Expected output: { msg: "invalid_request" }, then { msg: "invalid_token", error: "Invalid jwt_token" }
  test('Rejects a call that is not signed in', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId]);

    const noToken = await api.get(`/api/games/${gameId}/ratings`);
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject({ msg: 'invalid_request' });

    const badToken = await api.get(`/api/games/${gameId}/ratings`).set(withToken('not-a-real-token'));
    expect(badToken.status).toBe(401);
    expect(badToken.body).toEqual({ msg: 'invalid_token', error: 'Invalid jwt_token' });
  });

  // Input: Alice opens the list for a completed game with the organizer, Ben, Cara and Ned,
  //   who didn't show up. Alice already rated Ben
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { msg: "success", game_title, organizer_id, players } with Ben, Cara and
  //   Olivia in name order, Ben marked rated. Alice and Ned are left out, and no stars are sent
  test('Lists the other players who showed up and who was rated', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId, benId, caraId, nedId], [nedId]);
    await addRating(gameId, aliceId, benId, 4);

    const response = await api.get(`/api/games/${gameId}/ratings`).set(asUser(aliceId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(listOf([
      { user_id: benId, first_name: 'Ben', last_name: 'Tester', rated: true },
      { user_id: caraId, first_name: 'Cara', last_name: 'Tester', rated: false },
      { user_id: organizerId, first_name: 'Olivia', last_name: 'Tester', rated: false },
    ]));
  });

  // Input: the organizer opens the list for a completed game where the only other player, Ned,
  //   didn't show up
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { msg: "success", players: [] }
  test('Nobody else showed up', async () => {
    const gameId = await addCompletedGame(organizerId, [nedId], [nedId]);

    const response = await api.get(`/api/games/${gameId}/ratings`).set(asUser(organizerId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(listOf([]));
  });

  // Input: Ben leaves the completed game, then Ben and Alice each open the list
  // Expected status code: 200 for both
  // Expected behavior: leaving doesn't erase that Ben played
  // Expected output: Ben's list has Alice and Olivia, and Alice's list still has Ben and Olivia
  test('A player who left after the game was completed still counts', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId, benId]);
    await removeFromPlayers(gameId, benId);

    const bens = await api.get(`/api/games/${gameId}/ratings`).set(asUser(benId));
    const alices = await api.get(`/api/games/${gameId}/ratings`).set(asUser(aliceId));

    expect(bens.status).toBe(200);
    expect(bens.body).toEqual(listOf([
      { user_id: aliceId, first_name: 'Alice', last_name: 'Tester', rated: false },
      { user_id: organizerId, first_name: 'Olivia', last_name: 'Tester', rated: false },
    ]));
    expect(alices.status).toBe(200);
    expect(alices.body).toEqual(listOf([
      { user_id: benId, first_name: 'Ben', last_name: 'Tester', rated: false },
      { user_id: organizerId, first_name: 'Olivia', last_name: 'Tester', rated: false },
    ]));
  });

  // Input: game ids "abc", "0" and "1.5"
  // Expected status code: 400
  // Expected behavior: nothing is read
  // Expected output: { msg: "invalid_request", error: "gameId must be a positive whole number" }
  test.each(['abc', '0', '1.5'])('Rejects a bad game id: %s', async (gameId) => {
    const response = await api.get(`/api/games/${gameId}/ratings`).set(asUser(aliceId));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ msg: 'invalid_request', error: 'gameId must be a positive whole number' });
  });

  // Input: a game id no game has
  // Expected status code: 404
  // Expected behavior: nothing is read
  // Expected output: { msg: "not_found", error: "This game does not exist" }
  test("Game doesn't exist", async () => {
    const response = await api.get(`/api/games/${MISSING_GAME_ID}/ratings`).set(asUser(aliceId));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ msg: 'not_found', error: 'This game does not exist' });
  });

  // Input: Alice, a player, opens the list of an upcoming, a started and a cancelled game,
  //   none of them marked completed
  // Expected status code: 403
  // Expected behavior: nothing is read
  // Expected output: { msg: "forbidden" } with the reason
  test.each([
    ['upcoming', addGame],
    ['started', addStartedGame],
    ['cancelled', addCancelledGame],
  ])("Cannot open the list of a game that isn't completed: %s", async (_state, addGameInState) => {
    const gameId = await addGameInState(organizerId);
    await addPlayer(gameId, aliceId);

    const response = await api.get(`/api/games/${gameId}/ratings`).set(asUser(aliceId));

    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
  });

  // Input: Ned, who didn't show up, and Sam, who was never in the game, open the list
  // Expected status code: 403
  // Expected behavior: nothing is read
  // Expected output: { msg: "forbidden" } with the reason
  test('Only players who showed up can open the list', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId, nedId], [nedId]);

    const noShow = await api.get(`/api/games/${gameId}/ratings`).set(asUser(nedId));
    const outsider = await api.get(`/api/games/${gameId}/ratings`).set(asUser(samId));

    expect(noShow.status).toBe(403);
    expect(noShow.body).toEqual(FORBIDDEN);
    expect(outsider.status).toBe(403);
    expect(outsider.body).toEqual(FORBIDDEN);
  });

  // Input: Alice opens the list 23 hours 59 minutes after the game was marked completed
  // Expected status code: 200
  // Expected behavior: rating is still open
  // Expected output: { msg: "success", players } with the organizer
  test('The list is still open just before a day has passed', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId]);
    await setCompletedMinutesAgo(gameId, JUST_BEFORE_CLOSING);

    const response = await api.get(`/api/games/${gameId}/ratings`).set(asUser(aliceId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(listOf([
      { user_id: organizerId, first_name: 'Olivia', last_name: 'Tester', rated: false },
    ]));
  });

  // Input: Alice opens the list 24 hours 1 minute after the game was marked completed
  // Expected status code: 403
  // Expected behavior: the players are not shown
  // Expected output: { msg: "rating_closed", error: "Rating for this game has closed" }
  test('The list closes once a day has passed', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId]);
    await setCompletedMinutesAgo(gameId, JUST_AFTER_CLOSING);

    const response = await api.get(`/api/games/${gameId}/ratings`).set(asUser(aliceId));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ msg: 'rating_closed', error: 'Rating for this game has closed' });
  });
});