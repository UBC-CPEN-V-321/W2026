import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { createApp } from "../../src/app";
import type { Game } from "../../src/generated/prisma/client";
import { Format, GameSource, GameStatus } from "../../src/generated/prisma/enums";
import {
  addPlayerToTeam,
  deleteGame,
  fetchGame,
  fetchGameDetails,
  type GameDetails,
  isUserInGame,
  startBookedGame,
} from "../../src/games/games.repository";
import { gameStreams } from "../../src/games/games.events";
import { EventReader } from "./sseReader";
import { getForecast } from "../../src/external/weather";
import { signAccessToken } from "../../src/auth/tokens";

process.env.JWT_SECRET = "test-jwt-secret";
const userId = "user-123";
const otherUserId = "user-456";
const gameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";

jest.mock("../../src/games/games.repository", () => ({
  fetchGame: jest.fn(),
  fetchGameDetails: jest.fn(),
  addPlayerToTeam: jest.fn(),
  deleteGame: jest.fn(),
  isUserInGame: jest.fn(),
  startBookedGame: jest.fn(),
}));

jest.mock("../../src/external/weather", () => ({
  getForecast: jest.fn(),
}));

const mockedFetchGame = jest.mocked(fetchGame);
const mockedFetchGameDetails = jest.mocked(fetchGameDetails);
const mockedAddPlayerToTeam = jest.mocked(addPlayerToTeam);
const mockedDeleteGame = jest.mocked(deleteGame);
const mockedIsUserInGame = jest.mocked(isUserInGame);
const mockedStartBookedGame = jest.mocked(startBookedGame);
const mockedGetForecast = jest.mocked(getForecast);

const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

const gameRow = (): Game => ({
  id: gameId,
  format: Format.SINGLES,
  startsAt,
  courtId: 1,
  gameSource: GameSource.SCHEDULED,
  status: GameStatus.OPEN,
  createdAt: new Date(),
});

const player = (id: string, team: number) => ({
  id,
  username: id,
  name: `Player ${id}`,
  rating: 1500,
  team,
  acceptedAt: new Date(),
  ratingBefore: null,
  ratingAfter: null,
});

const gameDetails = (overrides: Partial<GameDetails> = {}): GameDetails => ({
  ...gameRow(),
  court: { id: 1, name: "Kitsilano Beach Park", latitude: 49.27, longitude: -123.15 },
  players: [player(userId, 1)],
  rounds: [],
  tournament: null,
  ...overrides,
});

interface StreamedGame {
  game: { id: string; status: string; players: { id: string }[] };
}

describe("Mocked: GET /games/events", () => {
  let server: Server;
  let baseUrl: string;
  const aborts: AbortController[] = [];

  beforeAll(async () => {
    server = createApp().listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const abort of aborts.splice(0)) abort.abort();
    gameStreams.closeAll();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetForecast.mockResolvedValue(null);
  });

  async function watchGame(): Promise<EventReader> {
    const abort = new AbortController();
    aborts.push(abort);
    const response = await fetch(`${baseUrl}/games/events?gameId=${gameId}`, {
      headers: { Authorization: `Bearer ${signAccessToken(userId)}` },
      signal: abort.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    if (!response.body) throw new Error("No response body");
    return new EventReader(response.body.getReader());
  }

  // Input: a request without an access token
  // Expected status code: 401
  // Expected behavior: no stream is opened
  // Expected output: an error body
  it("rejects a request without a token", async () => {
    const res = await request(createApp()).get("/games/events").query({ gameId });

    expect(res.status).toBe(401);
    expect(gameStreams.has(gameId)).toBe(false);
  });

  // Input: a game ID that does not exist
  // Expected status code: 404
  // Expected behavior: no stream is opened
  // Expected output: GAME_NOT_FOUND
  it("returns 404 for a missing game", async () => {
    mockedFetchGameDetails.mockResolvedValue(null);

    const res = await request(createApp())
      .get("/games/events")
      .query({ gameId })
      .set("Authorization", `Bearer ${signAccessToken(userId)}`);

    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe("GAME_NOT_FOUND");
    expect(gameStreams.has(gameId)).toBe(false);
  });

  // Input: a watched game that another player joins
  // Expected status code: 200, and 204 for the join
  // Expected behavior: the watcher gets the game with the new player without asking for it
  // Expected output: gameUpdated with the current game, then gameUpdated with both players
  it("sends the current game, then the game after another player joins", async () => {
    mockedFetchGameDetails.mockResolvedValueOnce(gameDetails());
    const events = await watchGame();

    const first = await events.next();
    expect(first.event).toBe("gameUpdated");
    expect((first.data as StreamedGame).game.players.map((p) => p.id)).toEqual([userId]);

    mockedFetchGame.mockResolvedValue(gameRow());
    mockedAddPlayerToTeam.mockResolvedValue("added");
    mockedFetchGameDetails.mockResolvedValue(
      gameDetails({ status: GameStatus.BOOKED, players: [player(userId, 1), player(otherUserId, 2)] }),
    );

    const join = await request(createApp())
      .post("/games/join")
      .set("Authorization", `Bearer ${signAccessToken(otherUserId)}`)
      .send({ gameId, team: 2 });
    expect(join.status).toBe(204);

    const update = await events.next();
    expect(update.event).toBe("gameUpdated");
    const { game } = update.data as StreamedGame;
    expect(game.status).toBe(GameStatus.BOOKED);
    expect(game.players.map((p) => p.id)).toEqual([userId, otherUserId]);
  });

  // Input: a watched scheduled game that a player cancels
  // Expected status code: 204 for the cancel
  // Expected behavior: the watcher learns the game is gone
  // Expected output: gameDeleted with the game ID
  it("sends gameDeleted once the game is deleted", async () => {
    mockedFetchGameDetails.mockResolvedValueOnce(gameDetails());
    const events = await watchGame();
    await events.next();

    mockedFetchGame.mockResolvedValue(gameRow());
    mockedIsUserInGame.mockResolvedValue(true);
    mockedDeleteGame.mockResolvedValue(true);
    mockedFetchGameDetails.mockResolvedValue(null);

    const cancel = await request(createApp())
      .delete("/games")
      .query({ gameId })
      .set("Authorization", `Bearer ${signAccessToken(otherUserId)}`);
    expect(cancel.status).toBe(204);

    const update = await events.next();
    expect(update).toEqual({ event: "gameDeleted", data: { gameId } });
  });

  // Input: a watched booked game that the other player starts with Start now
  // Expected status code: 200 for the start
  // Expected behavior: the watcher gets the game as in progress without asking for it
  // Expected output: gameUpdated with status IN_PROGRESS
  it("sends the game once another player starts it", async () => {
    mockedFetchGameDetails.mockResolvedValueOnce(gameDetails({ status: GameStatus.BOOKED }));
    const events = await watchGame();
    await events.next();

    mockedFetchGame.mockResolvedValue({ ...gameRow(), status: GameStatus.BOOKED });
    mockedIsUserInGame.mockResolvedValue(true);
    mockedStartBookedGame.mockResolvedValue({ ...gameRow(), status: GameStatus.IN_PROGRESS, startsAt: new Date() });
    mockedFetchGameDetails.mockResolvedValue(gameDetails({ status: GameStatus.IN_PROGRESS }));

    const start = await request(createApp())
      .post("/games/start")
      .set("Authorization", `Bearer ${signAccessToken(otherUserId)}`)
      .send({ gameId });
    expect(start.status).toBe(200);

    const update = await events.next();
    expect(update.event).toBe("gameUpdated");
    expect((update.data as StreamedGame).game.status).toBe(GameStatus.IN_PROGRESS);
  });

  // Input: a watcher that disconnects
  // Expected status code: N/A
  // Expected behavior: the server forgets the stream, and later changes load nothing for it
  // Expected output: gameStreams.has is false
  it("stops watching once the client disconnects", async () => {
    mockedFetchGameDetails.mockResolvedValueOnce(gameDetails());
    const events = await watchGame();
    await events.next();
    expect(gameStreams.has(gameId)).toBe(true);

    for (const abort of aborts.splice(0)) abort.abort();
    for (let tries = 0; tries < 50 && gameStreams.has(gameId); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(gameStreams.has(gameId)).toBe(false);
  });
});
