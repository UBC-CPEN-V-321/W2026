import request from "supertest";
import { createApp } from "../../src/app";
import { signAccessToken } from "../../src/auth/tokens";
import {
  fetchLeaderboardUser,
  fetchRatedGames,
} from "../../src/ranking/ratings.repository";

// /stats is behind requireAuth, so requests need a valid token
process.env.JWT_SECRET = "test-jwt-secret";
const userId = "0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e";
const otherUserId = "7c2e9b14-3f5a-4d6b-8e7c-0a1b2c3d4e5f";
const authHeader = `Bearer ${signAccessToken(userId)}`;

jest.mock("../../src/ranking/ratings.repository", () => ({
  fetchLeaderboard: jest.fn(),
  fetchLeaderboardUser: jest.fn(),
  fetchRatedGames: jest.fn(),
  fetchGamePlayerRatingsForUpdate: jest.fn(),
  saveRatingChanges: jest.fn(),
}));

const mockedFetchLeaderboardUser = jest.mocked(fetchLeaderboardUser);
const mockedFetchRatedGames = jest.mocked(fetchRatedGames);

const player = (id: string, username: string, rating: number) => ({
  id,
  username,
  name: username,
  rating,
});

const playedAt = new Date("2026-11-10T17:00:00.000Z");

// Interface GET /stats
describe("Mocked: GET /stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Input: no userId; the caller is ranked 4th and has won one game 6-3 6-4 against a 1450-rated player
  // Expected behavior: the caller's own stats are summarized from their rated games
  // Expected output: 200 with the caller's entry, tennis, the totals, history and one opponent band
  test("Returns the caller's stats", async () => {
    mockedFetchLeaderboardUser.mockResolvedValue({
      user: player(userId, "ace", 1520),
      rank: 4,
    });
    mockedFetchRatedGames.mockResolvedValue([
      {
        gameId: "g1",
        playedAt,
        team: 1,
        ratingBefore: 1500,
        ratingAfter: 1520,
        rounds: [
          [6, 3],
          [6, 4],
        ],
        opponentRatings: [1450],
      },
    ]);

    const response = await request(createApp())
      .get("/stats")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      stats: {
        user: { ...player(userId, "ace", 1520), rank: 4 },
        sport: "TENNIS",
        gamesPlayed: 1,
        wins: 1,
        losses: 0,
        setsPlayed: 2,
        setsWon: 2,
        setsLost: 0,
        pointsWon: 12,
        pointsLost: 7,
        ratingHistory: [
          {
            gameId: "g1",
            playedAt: playedAt.toISOString(),
            ratingBefore: 1500,
            ratingAfter: 1520,
          },
        ],
        vsOpponentRating: [
          { minRating: 1400, maxRating: 1500, games: 1, wins: 1, losses: 0, averageMargin: 5 },
        ],
      },
    });
    expect(mockedFetchLeaderboardUser).toHaveBeenCalledWith(userId);
    expect(mockedFetchRatedGames).toHaveBeenCalledWith(userId);
  });

  // Input: userId of another player with no rated games
  // Expected behavior: that player's stats are returned instead of the caller's
  // Expected output: 200 with zero totals
  test("Returns another player's stats", async () => {
    mockedFetchLeaderboardUser.mockResolvedValue({
      user: player(otherUserId, "bob", 1500),
      rank: 9,
    });
    mockedFetchRatedGames.mockResolvedValue([]);

    const response = await request(createApp())
      .get("/stats")
      .query({ userId: otherUserId })
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.stats).toMatchObject({
      user: { id: otherUserId, rank: 9 },
      gamesPlayed: 0,
      ratingHistory: [],
      vsOpponentRating: [],
    });
    expect(mockedFetchRatedGames).toHaveBeenCalledWith(otherUserId);
  });

  // Input: a userId that doesn't exist
  // Expected behavior: nothing to summarize
  // Expected output: 404 "User not found"
  test("Returns 404 for an unknown user", async () => {
    mockedFetchLeaderboardUser.mockResolvedValue(null);
    mockedFetchRatedGames.mockResolvedValue([]);

    const response = await request(createApp())
      .get("/stats")
      .query({ userId: otherUserId })
      .set("Authorization", authHeader);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "User not found" });
  });

  // Input: a userId that isn't a UUID, or an unknown parameter
  // Expected behavior: rejected before reaching the repository
  // Expected output: 400
  test.each([
    ["a userId that isn't a UUID", { userId: "bob" }],
    ["an unknown parameter", { sport: "TENNIS" }],
  ])("Rejects %s", async (_description, query) => {
    const response = await request(createApp())
      .get("/stats")
      .query(query)
      .set("Authorization", authHeader);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request query");
    expect(mockedFetchRatedGames).not.toHaveBeenCalled();
  });

  // Input: no Authorization header
  // Expected behavior: requireAuth rejects the request
  // Expected output: 401
  test("Rejects a request without a token", async () => {
    const response = await request(createApp()).get("/stats");

    expect(response.status).toBe(401);
    expect(mockedFetchRatedGames).not.toHaveBeenCalled();
  });

  // Input: the repository throws
  // Expected behavior: the error is logged
  // Expected output: 500
  test("Returns 500 when the database fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    mockedFetchLeaderboardUser.mockResolvedValue(null);
    mockedFetchRatedGames.mockRejectedValue(new Error("database down"));

    const response = await request(createApp())
      .get("/stats")
      .set("Authorization", authHeader);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error" });
    consoleError.mockRestore();
  });
});
