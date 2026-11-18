import { executeWrite } from '../../../src/core/db/mysql';
import { addGame, addJoinRequest, addUser, api, asUser, cleanUpAfterTests, MISSING_GAME_ID } from '../helpers';

// a new player's score: every game counts as perfect until they have played some
const NEW_PLAYER_SCORE = 5;
// past games the requester played. game_attendance and player_ratings don't reference
// the games table, so these needn't be real games
const NO_SHOW_GAME_ID = 900001;
const RATED_GAME_ID = 900002;
// (no-show 1 + rated 3 + three games still counted as perfect 5 + 5 + 5) / 5 games
const EXPECTED_SCORE = 3.8;

let organizerId: number;
let olderRequesterId: number;
let newerRequesterId: number;
let declinedRequesterId: number;
let requesterId: number;
let raterId: number;
let otherUserId: number;

beforeEach(async () => {
  organizerId = await addUser('Olivia');
  olderRequesterId = await addUser('Otto');
  newerRequesterId = await addUser('Nina');
  declinedRequesterId = await addUser('Dan');
  requesterId = await addUser('Rae');
  raterId = await addUser('Remy');
  otherUserId = await addUser('Omar');
});

cleanUpAfterTests();

// Interface GET /api/games/{gameId}/join-requests
describe('Unmocked: GET /api/games/{gameId}/join-requests', () => {
  // Input: the organizer opens the list for their game, which has two pending requests and one declined
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { msg: "success", game, requests } with only the two pending requests,
  //   newest first, each with the person's name, answers and reputation_score
  test('Pending requests', async () => {
    // 1. a game with two pending requests and one declined. The newer one is added
    //    first, so the order can't come from when the rows were added
    const gameId = await addGame(organizerId);
    await executeWrite(
      `INSERT INTO join_requests (game_id, user_id, skill_level, play_frequency, message, status, created_at)
       VALUES (?, ?, 'advanced', 'weekly', 'Newer request', 'pending', '2026-01-02 00:00:00')`,
      [gameId, newerRequesterId],
    );
    await executeWrite(
      `INSERT INTO join_requests (game_id, user_id, skill_level, status, created_at)
       VALUES (?, ?, 'beginner', 'pending', '2026-01-01 00:00:00')`,
      [gameId, olderRequesterId],
    );
    await executeWrite(
      `INSERT INTO join_requests (game_id, user_id, skill_level, status, created_at)
       VALUES (?, ?, 'beginner', 'declined', '2026-01-03 00:00:00')`,
      [gameId, declinedRequesterId],
    );

    // 2. open the list through the interface
    const response = await api.get(`/api/games/${gameId}/join-requests`).set(asUser(organizerId));

    // 3. check only the pending requests are listed, newest first
    expect(response.status).toBe(200);
    expect(response.body.msg).toBe('success');
    expect(response.body.game.game_id).toBe(gameId);
    expect(response.body.requests).toHaveLength(2);
    expect(response.body.requests[0]).toMatchObject({
      user: { user_id: newerRequesterId, first_name: 'Nina', last_name: 'Tester' },
      skill_level: 'advanced',
      play_frequency: 'weekly',
      message: 'Newer request',
      reputation_score: NEW_PLAYER_SCORE,
    });
    expect(response.body.requests[1]).toMatchObject({
      user: { user_id: olderRequesterId, first_name: 'Otto', last_name: 'Tester' },
      skill_level: 'beginner',
      play_frequency: null,
      message: null,
      reputation_score: NEW_PLAYER_SCORE,
    });
  });

  // Input: the organizer opens the list, where the requester has a no-show in one past game
  //   and was rated 3 stars in every category by the only other player in another
  // Expected status code: 200
  // Expected behavior: the score is worked out from the requester's real history
  // Expected output: { msg: "success", requests } with the request's reputation_score 3.8
  test('Reputation score', async () => {
    // 1. a game the requester asked to join
    const gameId = await addGame(organizerId);
    await addJoinRequest(gameId, requesterId);

    // 2. the requester's history: a no-show in one game, 3 stars from the other player in another
    await executeWrite(
      `INSERT INTO game_attendance (game_id, user_id, no_show, played_at)
       VALUES (?, ?, TRUE, '2026-01-01 00:00:00'),
              (?, ?, FALSE, '2026-01-02 00:00:00'),
              (?, ?, FALSE, '2026-01-02 00:00:00')`,
      [NO_SHOW_GAME_ID, requesterId, RATED_GAME_ID, requesterId, RATED_GAME_ID, raterId],
    );
    await executeWrite(
      `INSERT INTO player_ratings (game_id, rater_id, rated_id, punctuality, sportsmanship, skill, reliability, overall)
       VALUES (?, ?, ?, 3, 3, 3, 3, 3)`,
      [RATED_GAME_ID, raterId, requesterId],
    );

    // 3. open the list through the interface
    const response = await api.get(`/api/games/${gameId}/join-requests`).set(asUser(organizerId));

    // 4. check the score
    expect(response.status).toBe(200);
    expect(response.body.requests).toHaveLength(1);
    expect(response.body.requests[0].user.user_id).toBe(requesterId);
    expect(response.body.requests[0].reputation_score).toBe(EXPECTED_SCORE);
  });

  // Input: the organizer opens the list for their game, which nobody has asked to join
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { msg: "success", game, requests } with requests an empty list
  test('No requests', async () => {
    const gameId = await addGame(organizerId);

    const response = await api.get(`/api/games/${gameId}/join-requests`).set(asUser(organizerId));

    expect(response.status).toBe(200);
    expect(response.body.msg).toBe('success');
    expect(response.body.requests).toEqual([]);
  });

  // Input: a user who isn't the organizer opens the list
  // Expected status code: 403
  // Expected behavior: the request is rejected, nothing changes
  // Expected output: { msg: "forbidden", error: "Only the organizer can see join requests" }
  test('Not the organizer', async () => {
    const gameId = await addGame(organizerId);

    const response = await api.get(`/api/games/${gameId}/join-requests`).set(asUser(otherUserId));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ msg: 'forbidden', error: 'Only the organizer can see join requests' });
  });

  // Input: a signed in user opens the list for an id with no game
  // Expected status code: 404
  // Expected behavior: nothing changes
  // Expected output: { msg: "not_found", error: "This game does not exist" }
  test("Game doesn't exist", async () => {
    const response = await api.get(`/api/games/${MISSING_GAME_ID}/join-requests`).set(asUser(otherUserId));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ msg: 'not_found', error: 'This game does not exist' });
  });
});
