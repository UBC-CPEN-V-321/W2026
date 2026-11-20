import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app";
import { signAccessToken } from "../../src/auth/tokens";
import { prisma } from "../../src/db";
import { GameSource, GameStatus } from "../../src/generated/prisma/enums";
import { runMatchmaking } from "../../src/matchmaking/matchmaking.service";
import type { EventReader } from "../mock/sseReader";
import { StreamTestServer } from "../streamServer";

// Runs matchmaking against a real database: two players queue, one run matches them, and the match must show
// everywhere the app looks for it at once: out of the queue, in both players' games, and on their live Games tab
// stream, which the app follows while searching in case the match push never arrives. The tests in this file run
// in order and share the two players and their match.
process.env.JWT_SECRET = "test-jwt-secret";
jest.setTimeout(60_000);

interface TestUser {
  id: string;
  auth: string;
}

interface GameBody {
  id: string;
  status: string;
  gameSource: string;
  players: { id: string }[];
}

interface GameListBody {
  games: GameBody[];
}

// Unique per run, so the test never collides with existing users
const run = randomUUID().slice(0, 8);
const app = createApp();
const server = new StreamTestServer();
const users: TestUser[] = [];
let matchId = "";

// Reykjavik: far from every other queued player, so the run can only match these two with each other
const farAway = { format: "EITHER", latitude: 64.1466, longitude: -21.9426 };

const auth = (index: number) => users.at(index)?.auth ?? "";

/** The player's open matched game in their games, if any */
async function pendingMatchOf(index: number): Promise<GameBody | undefined> {
  const response = await request(app).get("/games/me").set("Authorization", auth(index));
  expect(response.status).toBe(200);
  return (response.body as GameListBody).games.find(
    ({ gameSource, status }) => gameSource === GameSource.MATCHED && status === GameStatus.OPEN,
  );
}

/** Reads the stream until a "mine" event lists the player's open matched game, and returns it */
async function nextMatchOn(events: EventReader): Promise<GameBody> {
  for (;;) {
    const { event, data } = await events.next();
    const match = (data as GameListBody).games.find(
      ({ gameSource, status }) => gameSource === GameSource.MATCHED && status === GameStatus.OPEN,
    );
    if (event === "mine" && match) {
      return match;
    }
  }
}

beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const user = await prisma.user.create({
      data: {
        googleSub: `matchmaking-test-${run}-${index}`,
        username: `matchmaking-${run}-${index}@example.com`,
        name: `Match Player ${index + 1}`,
        email: `matchmaking-${run}-${index}@example.com`,
      },
    });
    users.push({ id: user.id, auth: `Bearer ${signAccessToken(user.id)}` });
  }
  await server.start();
});

afterEach(() => {
  server.stopWatching();
});

afterAll(async () => {
  const userIds = users.map(({ id }) => id);
  await prisma.matchmakingRequest.deleteMany({ where: { userId: { in: userIds } } });
  const games = await prisma.game.findMany({
    where: { players: { some: { userId: { in: userIds } } } },
    select: { id: true },
  });
  const gameIds = games.map(({ id }) => id);
  await prisma.gameUser.deleteMany({ where: { gameId: { in: gameIds } } });
  await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await server.close();
  await prisma.$disconnect();
});

describe("Unmocked: matchmaking", () => {
  // Interface POST /matchmaking, GET /games/feed/events, GET /matchmaking, GET /games/me
  // Input: two 1500-rated players queue for either format at the same place; player 1 has the Games stream open
  // Expected status code: 201 for each join, then 404 for each queue lookup
  // Expected behavior: one run matches them into one open matched singles game, takes both out of the queue in
  // the same step, and pushes the game on player 1's live stream
  // Expected output: the same game on the stream and in both players' games
  test("Shows a new match on the live stream, out of the queue and in both players' games", async () => {
    expect((await request(app).post("/matchmaking").set("Authorization", auth(0)).send(farAway)).status).toBe(201);
    expect((await request(app).post("/matchmaking").set("Authorization", auth(1)).send(farAway)).status).toBe(201);
    const events = await server.watch("/games/feed/events", users[0]?.id ?? "");

    const matches = await runMatchmaking();

    const ours = matches.find(({ userIds }) => userIds.includes(users[0]?.id ?? ""));
    expect(ours?.userIds.sort()).toEqual(users.map(({ id }) => id).sort());

    const streamed = await nextMatchOn(events);
    matchId = streamed.id;
    expect(streamed.players.map(({ id }) => id).sort()).toEqual(users.map(({ id }) => id).sort());

    for (const index of [0, 1]) {
      expect((await request(app).get("/matchmaking").set("Authorization", auth(index))).status).toBe(404);
      expect((await pendingMatchOf(index))?.id).toBe(matchId);
    }
  });

  // Interface POST /matchmaking
  // Input: player 2 tries to queue again while the match waits for answers
  // Expected status code: 403
  // Expected behavior: they stay out of the queue, so a second match can't be made for them
  // Expected output: ALREADY_HAS_MATCH
  test("Keeps a matched player out of the queue while the match waits", async () => {
    const response = await request(app).post("/matchmaking").set("Authorization", auth(1)).send(farAway);

    expect(response.status).toBe(403);
    expect((response.body as { code: string }).code).toBe("ALREADY_HAS_MATCH");
    await expect(runMatchmaking()).resolves.not.toContainEqual(
      expect.objectContaining({ userIds: expect.arrayContaining([users[1]?.id]) }),
    );
  });

  // Interface POST /games/accept, GET /games
  // Input: both players accept the match
  // Expected status code: 204 for each
  // Expected behavior: the game is booked once the second player accepts
  // Expected output: status BOOKED
  test("Books the match once both players accept", async () => {
    for (const index of [0, 1]) {
      const accepted = await request(app)
        .post("/games/accept")
        .set("Authorization", auth(index))
        .send({ gameId: matchId });
      expect(accepted.status).toBe(204);
    }

    const game = await request(app).get("/games").set("Authorization", auth(0)).query({ gameId: matchId });
    expect((game.body as { game: GameBody }).game.status).toBe(GameStatus.BOOKED);
  });
});
