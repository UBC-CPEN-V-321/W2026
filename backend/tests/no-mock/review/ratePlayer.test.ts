import { addPlayer, addStartedGame, addUser, api, asUser, cleanUpAfterTests, MISSING_GAME_ID, withToken } from '../helpers';
import {
  addCompletedGame,
  addRating,
  allStars,
  getRatings,
  removeFromPlayers,
  setCompletedMinutesAgo,
} from './reviewHelpers';

// rating closes a day (1440 minutes) after the game is marked completed
const JUST_BEFORE_CLOSING = 1439;
const JUST_AFTER_CLOSING = 1441;
// an id far above any user id the tests create
const MISSING_USER_ID = 999999999;

const FORBIDDEN = { msg: 'forbidden', error: 'Only players who showed up to a completed game can rate in it' };
const PLAYER_NOT_FOUND = { msg: 'player_not_found', error: "This player didn't show up to the game" };

let organizerId: number;
let aliceId: number;
let benId: number;
let nedId: number;
let samId: number;
// a completed game with the organizer, Alice, Ben, and Ned who didn't show up. Sam isn't in it
let gameId: number;

beforeEach(async () => {
  organizerId = await addUser('Olivia');
  aliceId = await addUser('Alice');
  benId = await addUser('Ben');
  nedId = await addUser('Ned');
  samId = await addUser('Sam');
  gameId = await addCompletedGame(organizerId, [aliceId, benId, nedId], [nedId]);
});

cleanUpAfterTests();

// Interface POST /api/games/{gameId}/ratings
describe('Unmocked: POST /api/games/{gameId}/ratings', () => {
  // Input: no Authorization header, then a token that isn't a real JWT
  // Expected status code: 400, then 401
  // Expected behavior: no rating is saved
  // Expected output: { msg: "invalid_request" }, then { msg: "invalid_token", error: "Invalid jwt_token" }
  test('Rejects a call that is not signed in', async () => {
    const body = { rated_user_id: benId, ...allStars(5) };

    const noToken = await api.post(`/api/games/${gameId}/ratings`).send(body);
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject({ msg: 'invalid_request' });

    const badToken = await api.post(`/api/games/${gameId}/ratings`).set(withToken('not-a-real-token')).send(body);
    expect(badToken.status).toBe(401);
    expect(badToken.body).toEqual({ msg: 'invalid_token', error: 'Invalid jwt_token' });
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: Alice rates Ben 6, 5, 4, 3 and 2 stars
  // Expected status code: 201
  // Expected behavior: the rating is saved with Alice as the rater and each category's stars
  // Expected output: { msg: "success" }
  test('Records a rating', async () => {
    const stars = { punctuality: 6, sportsmanship: 5, skill: 4, reliability: 3, overall: 2 };

    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...stars });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ msg: 'success' });
    expect(await getRatings(gameId)).toEqual([{ rater_id: aliceId, rated_id: benId, ...stars }]);
  });

  // Input: Alice rates Ben 1 star, then 6 stars, in every category (the lowest and highest)
  // Expected status code: 201
  // Expected behavior: the rating is saved with those stars
  // Expected output: { msg: "success" }
  test.each([1, 6])('Accepts the lowest and highest stars: %i', async (stars) => {
    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(stars) });

    expect(response.status).toBe(201);
    expect(await getRatings(gameId)).toEqual([{ rater_id: aliceId, rated_id: benId, ...allStars(stars) }]);
  });

  // Input: skill of 0 stars, then 7 stars (just outside 1 to 6)
  // Expected status code: 400
  // Expected behavior: no rating is saved
  // Expected output: { msg: "invalid_request", error: "skill must be a whole number from 1 to 6" }
  test.each([0, 7])('Rejects stars outside 1 to 6: %i', async (stars) => {
    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5), skill: stars });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ msg: 'invalid_request', error: 'skill must be a whole number from 1 to 6' });
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: overall of 3.5, "5", null and true
  // Expected status code: 400
  // Expected behavior: no rating is saved
  // Expected output: { msg: "invalid_request", error: "overall must be a whole number from 1 to 6" }
  test.each([3.5, '5', null, true])("Rejects stars that aren't whole numbers: %p", async (overall) => {
    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5), overall });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ msg: 'invalid_request', error: 'overall must be a whole number from 1 to 6' });
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: only punctuality is given
  // Expected status code: 400
  // Expected behavior: no rating is saved
  // Expected output: { msg: "invalid_request" } with an error naming the four missing categories
  test('Names every missing category', async () => {
    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, punctuality: 5 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      msg: 'invalid_request',
      error: 'sportsmanship, skill, reliability, overall must be a whole number from 1 to 6',
    });
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: no body, then rated_user_id left out, "2", 0, -1 and 1.5
  // Expected status code: 400
  // Expected behavior: no rating is saved
  // Expected output: { msg: "invalid_request", error: "rated_user_id must be a user id" }
  test('Rejects a missing or invalid rated_user_id', async () => {
    const noBody = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId));
    expect(noBody.status).toBe(400);
    expect(noBody.body).toEqual({ msg: 'invalid_request', error: 'rated_user_id must be a user id' });

    for (const ratedUserId of [undefined, '2', 0, -1, 1.5]) {
      const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
        .send({ rated_user_id: ratedUserId, ...allStars(5) });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ msg: 'invalid_request', error: 'rated_user_id must be a user id' });
    }
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: the game id "abc"
  // Expected status code: 400
  // Expected behavior: no rating is saved
  // Expected output: { msg: "invalid_request", error: "gameId must be a positive whole number" }
  test('Rejects a bad game id', async () => {
    const response = await api.post('/api/games/abc/ratings').set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ msg: 'invalid_request', error: 'gameId must be a positive whole number' });
  });

  // Input: a game id no game has
  // Expected status code: 403
  // Expected behavior: no rating is saved, since nobody showed up to a game that doesn't exist
  // Expected output: { msg: "forbidden" } with the reason
  test("Game doesn't exist", async () => {
    const response = await api.post(`/api/games/${MISSING_GAME_ID}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
    expect(await getRatings(MISSING_GAME_ID)).toEqual([]);
  });

  // Input: Alice rates herself
  // Expected status code: 409
  // Expected behavior: no rating is saved
  // Expected output: { msg: "rated_self", error: "You can't rate yourself" }
  test('Cannot rate yourself', async () => {
    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: aliceId, ...allStars(6) });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ msg: 'rated_self', error: "You can't rate yourself" });
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: Alice rates Ned, who didn't show up, then Sam, who wasn't in the game, then a user id
  //   no user has
  // Expected status code: 404
  // Expected behavior: no rating is saved
  // Expected output: { msg: "player_not_found", error: "This player didn't show up to the game" }
  test('Can only rate players who showed up', async () => {
    for (const ratedUserId of [nedId, samId, MISSING_USER_ID]) {
      const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
        .send({ rated_user_id: ratedUserId, ...allStars(1) });
      expect(response.status).toBe(404);
      expect(response.body).toEqual(PLAYER_NOT_FOUND);
    }
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: Ned, who didn't show up, and Sam, who wasn't in the game, each rate Ben
  // Expected status code: 403
  // Expected behavior: no rating is saved
  // Expected output: { msg: "forbidden" } with the reason
  test('Only players who showed up can rate', async () => {
    for (const raterId of [nedId, samId]) {
      const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(raterId))
        .send({ rated_user_id: benId, ...allStars(6) });
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN);
    }
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: Alice rates Ben in a game that started but isn't marked completed yet
  // Expected status code: 403
  // Expected behavior: no rating is saved
  // Expected output: { msg: "forbidden" } with the reason
  test('Cannot rate before the game is marked completed', async () => {
    const startedGameId = await addStartedGame(organizerId);
    await addPlayer(startedGameId, aliceId);
    await addPlayer(startedGameId, benId);

    const response = await api.post(`/api/games/${startedGameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
    expect(await getRatings(startedGameId)).toEqual([]);
  });

  // Input: Alice rates Ben 23 hours 59 minutes after the game was marked completed
  // Expected status code: 201
  // Expected behavior: the rating is saved
  // Expected output: { msg: "success" }
  test('Can still rate just before a day has passed', async () => {
    await setCompletedMinutesAgo(gameId, JUST_BEFORE_CLOSING);

    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });

    expect(response.status).toBe(201);
    expect(await getRatings(gameId)).toHaveLength(1);
  });

  // Input: Alice rates Ben 24 hours 1 minute after the game was marked completed
  // Expected status code: 403
  // Expected behavior: no rating is saved
  // Expected output: { msg: "rating_closed", error: "Rating for this game has closed" }
  test('Cannot rate once a day has passed', async () => {
    await setCompletedMinutesAgo(gameId, JUST_AFTER_CLOSING);

    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ msg: 'rating_closed', error: 'Rating for this game has closed' });
    expect(await getRatings(gameId)).toEqual([]);
  });

  // Input: Alice rates Ben 6 stars, then rates him again with 1 star
  // Expected status code: 201, then 409
  // Expected behavior: only the first rating is saved, it can't be changed
  // Expected output: { msg: "success" }, then { msg: "already_rated", error: "You already rated this player" }
  test('A player can only be rated once by the same player', async () => {
    const first = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(6) });
    const second = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(1) });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ msg: 'already_rated', error: 'You already rated this player' });
    expect(await getRatings(gameId)).toEqual([{ rater_id: aliceId, rated_id: benId, ...allStars(6) }]);
  });

  // Input: Alice sends the same rating of Ben twice at the same time
  // Expected status code: one 201 and one 409
  // Expected behavior: only one rating is saved
  // Expected output: { msg: "success" } and { msg: "already_rated" }
  test('Two ratings sent at once save only one', async () => {
    const body = { rated_user_id: benId, ...allStars(4) };

    const [first, second] = await Promise.all([
      api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId)).send(body),
      api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId)).send(body),
    ]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await getRatings(gameId)).toHaveLength(1);
  });

  // Input: Ben already rated Alice. Then Alice rates Ben, and the organizer rates Ben
  // Expected status code: 201 for both
  // Expected behavior: each rater's rating is saved: once per rater and rated player, not once per pair or per player
  // Expected output: { msg: "success" }
  test('Each player can rate each other player once', async () => {
    await addRating(gameId, benId, aliceId, 3);

    const alices = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });
    const organizers = await api.post(`/api/games/${gameId}/ratings`).set(asUser(organizerId))
      .send({ rated_user_id: benId, ...allStars(2) });

    expect(alices.status).toBe(201);
    expect(organizers.status).toBe(201);
    expect(await getRatings(gameId)).toHaveLength(3);
  });

  // Input: Ben leaves the completed game, then Ben rates Alice and Alice rates Ben
  // Expected status code: 201 for both
  // Expected behavior: both ratings are saved, leaving doesn't erase that Ben played
  // Expected output: { msg: "success" }
  test('A player who left after the game was completed can still rate and be rated', async () => {
    await removeFromPlayers(gameId, benId);

    const bens = await api.post(`/api/games/${gameId}/ratings`).set(asUser(benId))
      .send({ rated_user_id: aliceId, ...allStars(5) });
    const alices = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rated_user_id: benId, ...allStars(5) });

    expect(bens.status).toBe(201);
    expect(alices.status).toBe(201);
    expect(await getRatings(gameId)).toHaveLength(2);
  });

  // Input: Alice is signed in and sends a rating of Ben with rater_id set to the organizer
  // Expected status code: 201
  // Expected behavior: the rating is saved as Alice's. Nobody can rate in someone else's name
  // Expected output: { msg: "success" }
  test('The rater is always the signed in user', async () => {
    const response = await api.post(`/api/games/${gameId}/ratings`).set(asUser(aliceId))
      .send({ rater_id: organizerId, rated_user_id: benId, ...allStars(5) });

    expect(response.status).toBe(201);
    expect(await getRatings(gameId)).toEqual([{ rater_id: aliceId, rated_id: benId, ...allStars(5) }]);
  });
});