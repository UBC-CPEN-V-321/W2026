import { fetchGamesInProgress } from "../../src/friends/friends.repository";
import { GameStatus } from "../../src/generated/prisma/enums";

// A fake Prisma client with only what fetchGamesInProgress uses. Its mocks are plain properties, safe for expect()
function mockPrismaClient() {
  return { gameUser: { findMany: jest.fn() } };
}

jest.mock("../../src/db", () => ({ prisma: mockPrismaClient() }));

const db = jest.requireMock<{ prisma: ReturnType<typeof mockPrismaClient> }>("../../src/db").prisma;

describe("Mocked: fetchGamesInProgress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Input: no users (a user with no friends)
  // Expected behavior: the database isn't asked
  // Expected output: []
  test("returns nothing without asking the database for no users", async () => {
    await expect(fetchGamesInProgress([], new Date())).resolves.toEqual([]);
    expect(db.gameUser.findMany).not.toHaveBeenCalled();
  });

  // Input: two users and the earliest start time that still counts as playing
  // Expected behavior: only their games in progress that started since then are read, with the fields the
  // friends list shows
  // Expected output: the rows the database returns
  test("reads the users' games in progress that started recently", async () => {
    const since = new Date("2026-11-19T17:00:00Z");
    const rows = [
      {
        userId: "u1",
        game: { id: "g1", format: "SINGLES", startsAt: new Date(), court: { name: "Kitsilano Beach Park" } },
      },
    ];
    db.gameUser.findMany.mockResolvedValue(rows);

    await expect(fetchGamesInProgress(["u1", "u2"], since)).resolves.toBe(rows);
    expect(db.gameUser.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["u1", "u2"] },
        game: { status: GameStatus.IN_PROGRESS, startsAt: { gte: since } },
      },
      select: {
        userId: true,
        game: { select: { id: true, format: true, startsAt: true, court: { select: { name: true } } } },
      },
    });
  });
});
