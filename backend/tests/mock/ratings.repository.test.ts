import { Prisma } from "../../src/generated/prisma/client";
import {
  fetchGamePlayerRatingsForUpdate,
  fetchRatedGames,
} from "../../src/ranking/ratings.repository";

// A fake Prisma client; its mocks are plain properties, so they are safe to pass to expect()
function mockPrismaClient() {
  return {
    gameUser: { findMany: jest.fn(), groupBy: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

jest.mock("../../src/db", () => ({ prisma: mockPrismaClient() }));

const db = jest.requireMock<{ prisma: ReturnType<typeof mockPrismaClient> }>(
  "../../src/db",
).prisma;
const tx = db as unknown as Prisma.TransactionClient;
const gameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";
const userId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

// Function fetchGamePlayerRatingsForUpdate
describe("Mocked: fetchGamePlayerRatingsForUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Input: a game with a player who has 12 rated games and a new player
  // Expected behavior: rated games are counted per player, excluding this game and unrated rows
  // Expected output: each locked player with their games played, 0 for the new player
  test("Adds each player's rated games played", async () => {
    db.$queryRaw.mockResolvedValue([
      { userId: "a", team: 1, rating: 1600 },
      { userId: "b", team: 2, rating: 1500 },
    ]);
    db.gameUser.groupBy.mockResolvedValue([{ userId: "a", _count: { _all: 12 } }]);

    const players = await fetchGamePlayerRatingsForUpdate(tx, gameId);

    expect(players).toEqual([
      { userId: "a", team: 1, rating: 1600, gamesPlayed: 12 },
      { userId: "b", team: 2, rating: 1500, gamesPlayed: 0 },
    ]);
    expect(db.gameUser.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["userId"],
        where: {
          userId: { in: ["a", "b"] },
          gameId: { not: gameId },
          ratingAfter: { not: null },
        },
      }),
    );
  });
});

// Function fetchRatedGames
describe("Mocked: fetchRatedGames", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Input: a doubles game where the user is on team 2, and a row without ratings
  // Expected behavior: rows become the user's side of each game; opponents are the other team's
  //        players, and the unrated row and any unrated opponent are skipped
  // Expected output: one rated game with its rounds as pairs and the two opponents' ratings
  test("Maps rated rows to games from the user's side", async () => {
    const startsAt = new Date("2026-11-10T17:00:00.000Z");
    db.gameUser.findMany.mockResolvedValue([
      {
        team: 2,
        ratingBefore: 1500,
        ratingAfter: 1512,
        game: {
          id: gameId,
          startsAt,
          rounds: [
            { team1Score: 4, team2Score: 6 },
            { team1Score: 3, team2Score: 6 },
          ],
          players: [
            { team: 1, ratingBefore: 1550 },
            { team: 1, ratingBefore: 1450 },
            { team: 2, ratingBefore: 1500 },
            { team: 2, ratingBefore: 1480 },
            { team: 1, ratingBefore: null },
          ],
        },
      },
      {
        team: 1,
        ratingBefore: null,
        ratingAfter: null,
        game: { id: "unrated", startsAt, rounds: [], players: [] },
      },
    ]);

    const games = await fetchRatedGames(userId);

    expect(games).toEqual([
      {
        gameId,
        playedAt: startsAt,
        team: 2,
        ratingBefore: 1500,
        ratingAfter: 1512,
        rounds: [
          [4, 6],
          [3, 6],
        ],
        opponentRatings: [1550, 1450],
      },
    ]);
    expect(db.gameUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, ratingBefore: { not: null }, ratingAfter: { not: null } },
      }),
    );
  });
});
