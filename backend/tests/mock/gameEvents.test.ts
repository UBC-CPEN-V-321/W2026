import request from "supertest";
import { createApp } from "../../src/app";
import { GameStatus } from "../../src/generated/prisma/enums";
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
import { gameErrors } from "../../src/games/games.service";
import { errorBody } from "../../src/errors";
import { getForecast } from "../../src/external/weather";
import { signAccessToken } from "../../src/auth/tokens";
import { gameDetails, gameRow, testGameId as gameId, testPlayer } from "../fixtures";
import { StreamTestServer } from "../streamServer";

process.env.JWT_SECRET = "test-jwt-secret";
const userId = "user-123";
const otherUserId = "user-456";

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

// The game with the watcher on team 1
const watchedGame = (overrides: Partial<GameDetails> = {}) =>
  gameDetails({ players: [testPlayer(userId, 1)], ...overrides });

interface StreamedGame {
  game: { id: string; status: string; players: { id: string }[] };
}

describe("Mocked: GET /games/events", () => {
  const server = new StreamTestServer();
  const watchGame = () => server.watch(`/games/events?gameId=${gameId}`, userId);

  beforeAll(() => server.start());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getForecast).mockResolvedValue(null);
  });

  afterEach(() => {
    server.stopWatching();
    gameStreams.closeAll();
  });

  afterAll(() => server.close());

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
    expect(res.body).toEqual(errorBody(gameErrors.NotFound));
    expect(gameStreams.has(gameId)).toBe(false);
  });

  // Input: a watched game that another player joins
  // Expected status code: 200, and 204 for the join
  // Expected behavior: the watcher gets the game with the new player without asking for it
  // Expected output: gameUpdated with the current game, then gameUpdated with both players
  it("sends the current game, then the game after another player joins", async () => {
    mockedFetchGameDetails.mockResolvedValueOnce(watchedGame());
    const events = await watchGame();

    const first = await events.next();
    expect(first.event).toBe("gameUpdated");
    expect((first.data as StreamedGame).game.players.map((p) => p.id)).toEqual([userId]);

    mockedFetchGame.mockResolvedValue(gameRow());
    mockedAddPlayerToTeam.mockResolvedValue("added");
    mockedFetchGameDetails.mockResolvedValue(
      watchedGame({ status: GameStatus.BOOKED, players: [testPlayer(userId, 1), testPlayer(otherUserId, 2)] }),
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
    mockedFetchGameDetails.mockResolvedValueOnce(watchedGame());
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
    mockedFetchGameDetails.mockResolvedValueOnce(watchedGame({ status: GameStatus.BOOKED }));
    const events = await watchGame();
    await events.next();

    mockedFetchGame.mockResolvedValue(gameRow({ status: GameStatus.BOOKED }));
    mockedIsUserInGame.mockResolvedValue(true);
    mockedStartBookedGame.mockResolvedValue(gameRow({ status: GameStatus.IN_PROGRESS, startsAt: new Date() }));
    mockedFetchGameDetails.mockResolvedValue(watchedGame({ status: GameStatus.IN_PROGRESS }));

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
    mockedFetchGameDetails.mockResolvedValueOnce(watchedGame());
    const events = await watchGame();
    await events.next();
    expect(gameStreams.has(gameId)).toBe(true);

    server.stopWatching();
    for (let tries = 0; tries < 50 && gameStreams.has(gameId); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(gameStreams.has(gameId)).toBe(false);
  });
});
