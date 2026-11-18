import { executeWrite } from '../../../../src/core/db/mysql';
import { addGame, addJoinRequest, addUser, api, asUser, cleanUpAfterTests } from '../../helpers';

// past games the requester played. game_attendance and player_ratings don't reference
// the games table, so these needn't be real games
const NO_SHOW_GAME_ID = 900001;
const RATED_GAME_ID = 900002;
// newest game first: the game rated 3 stars (Jan 2) then the no-show (Jan 1), which counts
// 0.9 as much, on top of the baseline of three games scoring 5: (15 + 3 + 0.9 × 1) / 4.9
const EXPECTED_SCORE = 3.86;

let organizerId: number;
let requesterId: number;
let raterId: number;

beforeEach(async () => {
  organizerId = await addUser('Olivia');
  requesterId = await addUser('Rae');
  raterId = await addUser('Remy');
});

cleanUpAfterTests();

// Interface GET /api/games/{gameId}/join-requests
describe('Unmocked: GET /api/games/{gameId}/join-requests', () => {
  // Input: the organizer opens the list, where the requester has a no-show in one past game
  //   and was rated 3 stars in every category by the only other player in another
  // Expected status code: 200
  // Expected behavior: the score is worked out from the requester's real history
  // Expected output: { msg: "success", requests } with the request's reputation_score 3.86
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
});
