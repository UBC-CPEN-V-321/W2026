import request from "supertest";
import { createApp } from "../../src/app";
import { Game, Prisma } from "../../src/generated/prisma/client";
import {
  Format,
  FriendshipStatus,
  GameSource,
  GameStatus,
} from "../../src/generated/prisma/enums";
import {
  acceptMatch,
  addPlayerToTeam,
  cancelMatchedGame,
  completeGame,
  createGame,
  deleteGame,
  deleteGameUser,
  fetchFeedGames,
  fetchGame,
  fetchGameDetails,
  fetchUserGames,
  fetchUserHistory,
  type GameDetails,
  isUserInGame,
  startBookedGame,
  updateGame,
} from "../../src/games/games.repository";
import {
  cancelGame,
  changeGameLocation,
  changeGameTime,
  gameErrors,
  getFeed,
  getGame,
  getUserGames,
  getUserHistory,
  joinGame,
  leaveGame,
  newGame,
  reportScore,
  startGame,
} from "../../src/games/games.service";
import { getForecast } from "../../src/external/weather";
import { isPushEnabled } from "../../src/external/fcm";
import { fetchFriendship } from "../../src/friends/friends.repository";
import { pushToUsers } from "../../src/users/users.service";
import { signAccessToken } from "../../src/auth/tokens";
import { authErrors } from "../../src/auth/requireAuth";
import { commonErrors, errorBody } from "../../src/errors";
import { IncompleteTeamsError } from "../../src/ranking/ranking.service";
import * as changes from "../../src/events/changes";

// Every /games route is behind requireAuth, so requests need a valid token
process.env.JWT_SECRET = "test-jwt-secret";
const userId = "user-123";
const authHeader = `Bearer ${signAccessToken(userId)}`;

jest.mock("../../src/games/games.repository", () => ({
  createGame: jest.fn(),
  fetchGame: jest.fn(),
  deleteGame: jest.fn(),
  isUserInGame: jest.fn(),
  deleteGameUser: jest.fn(),
  updateGame: jest.fn(),
  startBookedGame: jest.fn(),
  completeGame: jest.fn(),
  fetchGameDetails: jest.fn(),
  fetchFeedGames: jest.fn(),
  fetchUserGames: jest.fn(),
  fetchUserHistory: jest.fn(),
  addPlayerToTeam: jest.fn(),
  acceptMatch: jest.fn(),
  cancelMatchedGame: jest.fn(),
}));

jest.mock("../../src/external/weather", () => ({
  getForecast: jest.fn(),
}));

jest.mock("../../src/external/fcm", () => ({
  isPushEnabled: jest.fn(),
}));

jest.mock("../../src/friends/friends.repository", () => ({
  fetchFriendship: jest.fn(),
}));

jest.mock("../../src/users/users.service", () => ({
  ...jest.requireActual<typeof import("../../src/users/users.service")>(
    "../../src/users/users.service",
  ),
  pushToUsers: jest.fn(),
}));

const mockedIsPushEnabled = jest.mocked(isPushEnabled);
const mockedFetchFriendship = jest.mocked(fetchFriendship);
const mockedPushToUsers = jest.mocked(pushToUsers);

const mockedCreateGame = jest.mocked(createGame);
const mockedFetchGame = jest.mocked(fetchGame);
const mockedFetchGameDetails = jest.mocked(fetchGameDetails);
const mockedFetchFeedGames = jest.mocked(fetchFeedGames);
const mockedFetchUserGames = jest.mocked(fetchUserGames);
const mockedFetchUserHistory = jest.mocked(fetchUserHistory);
const mockedAddPlayerToTeam = jest.mocked(addPlayerToTeam);
const mockedAcceptMatch = jest.mocked(acceptMatch);
const mockedCancelMatchedGame = jest.mocked(cancelMatchedGame);
const mockedGetForecast = jest.mocked(getForecast);
const mockedDeleteGame = jest.mocked(deleteGame);
const mockedIsUserInGame = jest.mocked(isUserInGame);
const mockedDeleteGameUser = jest.mocked(deleteGameUser);
const mockedUpdateGame = jest.mocked(updateGame);
const mockedStartBookedGame = jest.mocked(startBookedGame);
const mockedCompleteGame = jest.mocked(completeGame);

const futureStartsAt = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const validBody = () => ({
  format: Format.SINGLES,
  startsAt: futureStartsAt(),
  courtId: 1,
  gameSource: GameSource.SCHEDULED,
});

const gameDetails = (overrides: Partial<GameDetails> = {}): GameDetails => ({
  id: "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b",
  format: Format.SINGLES,
  startsAt: new Date(futureStartsAt()),
  courtId: 1,
  gameSource: GameSource.SCHEDULED,
  status: GameStatus.OPEN,
  createdAt: new Date(),
  court: { id: 1, name: "Kitsilano Beach Park", latitude: 49.27, longitude: -123.15 },
  players: [
    {
      id: userId,
      username: "ace",
      name: "Ace Player",
      rating: 1500,
      photoUrl: null,
      team: 1,
      acceptedAt: new Date(),
      ratingBefore: null,
      ratingAfter: null,
    },
  ],
  rounds: [],
  tournament: null,
  ...overrides,
});

describe("Mocked: /games requireAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const gameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";

  const routes = () =>
    [
      [
        "POST /games",
        () => request(createApp()).post("/games").send(validBody()),
      ],
      [
        "GET /games",
        () => request(createApp()).get("/games").query({ gameId }),
      ],
      ["GET /games/feed", () => request(createApp()).get("/games/feed")],
      ["GET /games/me", () => request(createApp()).get("/games/me")],
      ["GET /games/history", () => request(createApp()).get("/games/history")],
      [
        "DELETE /games",
        () => request(createApp()).delete("/games").query({ gameId }),
      ],
      [
        "POST /games/join",
        () =>
          request(createApp()).post("/games/join").send({ gameId, team: 1 }),
      ],
      [
        "POST /games/leave",
        () => request(createApp()).post("/games/leave").send({ gameId }),
      ],
      [
        "POST /games/accept",
        () => request(createApp()).post("/games/accept").send({ gameId }),
      ],
      [
        "POST /games/invite",
        () =>
          request(createApp())
            .post("/games/invite")
            .send({ gameId, userId: gameId }),
      ],
      [
        "PATCH /games/time",
        () =>
          request(createApp())
            .patch("/games/time")
            .send({ gameId, startsAt: futureStartsAt() }),
      ],
      [
        "POST /games/start",
        () => request(createApp()).post("/games/start").send({ gameId }),
      ],
      [
        "PATCH /games/location",
        () =>
          request(createApp())
            .patch("/games/location")
            .send({ gameId, courtId: 2 }),
      ],
      [
        "POST /games/score",
        () =>
          request(createApp())
            .post("/games/score")
            .send({ gameId, rounds: [[6, 4]] }),
      ],
    ] as const;

  const expectNoRepositoryCalls = () => {
    expect(mockedCreateGame).not.toHaveBeenCalled();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedDeleteGame).not.toHaveBeenCalled();
    expect(mockedIsUserInGame).not.toHaveBeenCalled();
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
    expect(mockedUpdateGame).not.toHaveBeenCalled();
    expect(mockedStartBookedGame).not.toHaveBeenCalled();
    expect(mockedCompleteGame).not.toHaveBeenCalled();
    expect(mockedFetchGameDetails).not.toHaveBeenCalled();
    expect(mockedFetchFeedGames).not.toHaveBeenCalled();
    expect(mockedFetchUserGames).not.toHaveBeenCalled();
    expect(mockedAddPlayerToTeam).not.toHaveBeenCalled();
    expect(mockedAcceptMatch).not.toHaveBeenCalled();
  };

  test.each(routes())(
    "Rejects %s without an Authorization header",
    async (_route, send) => {
      const response = await send();

      expect(response.status).toBe(401);
      expect(response.body).toEqual(errorBody(authErrors.MissingToken));
      expectNoRepositoryCalls();
    },
  );

  test.each(routes())(
    "Rejects %s with an invalid token",
    async (_route, send) => {
      const response = await send().set("Authorization", "Bearer not-a-jwt");

      expect(response.status).toBe(401);
      expect(response.body).toEqual(errorBody(authErrors.InvalidToken));
      expectNoRepositoryCalls();
    },
  );
});

describe("Mocked: POST /games", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Creates a game with OPEN status and adds the creator to team 1", async () => {
    const body = validBody();
    const createdGame = {
      id: "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b",
      ...body,
      startsAt: new Date(body.startsAt),
      status: GameStatus.OPEN,
      createdAt: new Date(),
    };
    mockedCreateGame.mockResolvedValue(createdGame);

    const response = await request(createApp())
      .post("/games")
      .set("Authorization", authHeader)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.game).toMatchObject({
      id: createdGame.id,
      format: body.format,
      courtId: body.courtId,
      gameSource: body.gameSource,
      status: GameStatus.OPEN,
      startsAt: body.startsAt,
    });
    expect(mockedCreateGame).toHaveBeenCalledWith(
      {
        ...body,
        startsAt: new Date(body.startsAt),
        status: GameStatus.OPEN,
      },
      userId,
    );
  });

  test.each([
    ["removed sport field", { sport: "TENNIS" }],
    ["invalid format", { format: "TRIPLES" }],
    ["non-ISO startsAt", { startsAt: "tomorrow" }],
    ["startsAt without offset", { startsAt: "2099-01-01T10:00:00" }],
    ["non-integer courtId", { courtId: 1.5 }],
    ["non-positive courtId", { courtId: 0 }],
    ["string courtId", { courtId: "1" }],
    ["invalid gameSource", { gameSource: "MANUAL" }],
    ["TOURNAMENT gameSource", { gameSource: GameSource.TOURNAMENT }],
    ["unknown field", { status: GameStatus.COMPLETED }],
  ])("Rejects a body with %s", async (_description, overrides) => {
    const response = await request(createApp())
      .post("/games")
      .set("Authorization", authHeader)
      .send({ ...validBody(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedCreateGame).not.toHaveBeenCalled();
  });

  test.each([
    ["in the past", () => new Date(Date.now() - 60 * 1000).toISOString()],
    ["at the current time", () => new Date().toISOString()],
  ])("Rejects a start time %s", async (_description, startsAt) => {
    const response = await request(createApp())
      .post("/games")
      .set("Authorization", authHeader)
      .send({ ...validBody(), startsAt: startsAt() });

    expect(response.status).toBe(400);
    expect(response.body.details.fieldErrors.startsAt).toContain(
      "must be in the future",
    );
    expect(mockedCreateGame).not.toHaveBeenCalled();
  });

  test("Returns 404 when the court does not exist", async () => {
    mockedCreateGame.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint violated",
        {
          code: "P2003",
          clientVersion: Prisma.prismaVersion.client,
        },
      ),
    );

    const response = await request(createApp())
      .post("/games")
      .set("Authorization", authHeader)
      .send(validBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.CourtNotFound));
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedCreateGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .post("/games")
      .set("Authorization", authHeader)
      .send(validBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: GET /games", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const gameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";

  test("Returns the game with its court, players and rounds", async () => {
    const game = gameDetails({
      status: GameStatus.COMPLETED,
      rounds: [
        { number: 1, team1Score: 6, team2Score: 4 },
        { number: 2, team1Score: 6, team2Score: 3 },
      ],
    });
    mockedFetchGameDetails.mockResolvedValue(game);

    const response = await request(createApp())
      .get("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(200);
    expect(response.body.game).toMatchObject({
      id: gameId,
      format: game.format,
      courtId: game.courtId,
      gameSource: game.gameSource,
      status: game.status,
      startsAt: game.startsAt.toISOString(),
      court: game.court,
      players: [
        {
          id: userId,
          username: "ace",
          name: "Ace Player",
          rating: 1500,
          team: 1,
        },
      ],
      rounds: game.rounds,
      // A completed game is not played anymore, so it has no forecast
      forecast: null,
    });
    expect(mockedFetchGameDetails).toHaveBeenCalledWith(gameId);
    expect(mockedGetForecast).not.toHaveBeenCalled();
  });

  test("Returns an upcoming game with its forecast", async () => {
    const game = gameDetails({ status: GameStatus.BOOKED });
    const forecast = {
      at: game.startsAt,
      temperature: 18.5,
      description: "light rain",
      icon: "10d",
      precipitationChance: 0.4,
    };
    mockedFetchGameDetails.mockResolvedValue(game);
    mockedGetForecast.mockResolvedValue(forecast);

    const response = await request(createApp())
      .get("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(200);
    expect(response.body.game).toMatchObject({
      id: gameId,
      status: GameStatus.BOOKED,
      forecast: { ...forecast, at: forecast.at.toISOString() },
    });
    expect(mockedGetForecast).toHaveBeenCalledWith(
      game.court.latitude,
      game.court.longitude,
      game.startsAt,
    );
  });

  test("Returns the game without a forecast when it cannot be loaded", async () => {
    mockedFetchGameDetails.mockResolvedValue(gameDetails());
    mockedGetForecast.mockResolvedValue(null);

    const response = await request(createApp())
      .get("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(200);
    expect(response.body.game).toMatchObject({ id: gameId, forecast: null });
  });

  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGameDetails.mockResolvedValue(null);

    const response = await request(createApp())
      .get("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedFetchGameDetails).toHaveBeenCalledWith(gameId);
  });

  test.each([
    ["a missing gameId", {}],
    ["an empty gameId", { gameId: "" }],
    ["a non-UUID gameId", { gameId: "not-a-uuid" }],
    ["a numeric gameId", { gameId: "123" }],
    ["multiple gameIds", { gameId: [gameId, gameId] }],
  ])("Rejects a query with %s", async (_description, query) => {
    const response = await request(createApp())
      .get("/games")
      .set("Authorization", authHeader)
      .query(query);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGameDetails).not.toHaveBeenCalled();
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchGameDetails.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .get("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: GET /games/feed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Returns the feed's games with their forecast", async () => {
    const singles = gameDetails();
    const doubles = gameDetails({
      id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      format: Format.DOUBLES,
      courtId: 2,
      court: { id: 2, name: "Queen Elizabeth Park", latitude: 49.24, longitude: -123.11 },
    });
    const forecast = {
      at: singles.startsAt,
      temperature: 18.5,
      description: "light rain",
      icon: "10d",
      precipitationChance: 0.4,
    };
    mockedFetchFeedGames.mockResolvedValue([singles, doubles]);
    mockedGetForecast.mockResolvedValueOnce(forecast).mockResolvedValueOnce(null);

    const response = await request(createApp())
      .get("/games/feed")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.games).toHaveLength(2);
    expect(response.body.games[0]).toMatchObject({
      id: singles.id,
      court: singles.court,
      players: [{ id: userId, rating: 1500, team: 1 }],
      forecast: { ...forecast, at: forecast.at.toISOString() },
    });
    // A forecast that cannot be loaded leaves the game in the feed without one
    expect(response.body.games[1]).toMatchObject({
      id: doubles.id,
      forecast: null,
    });
    expect(mockedGetForecast).toHaveBeenNthCalledWith(
      1,
      singles.court.latitude,
      singles.court.longitude,
      singles.startsAt,
    );
    expect(mockedGetForecast).toHaveBeenNthCalledWith(
      2,
      doubles.court.latitude,
      doubles.court.longitude,
      doubles.startsAt,
    );
  });

  test("Returns an empty feed", async () => {
    mockedFetchFeedGames.mockResolvedValue([]);

    const response = await request(createApp())
      .get("/games/feed")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ games: [] });
    expect(mockedGetForecast).not.toHaveBeenCalled();
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchFeedGames.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .get("/games/feed")
      .set("Authorization", authHeader);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: GET /games/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Returns the authenticated user's games with their forecast", async () => {
    const booked = gameDetails({ status: GameStatus.BOOKED });
    const open = gameDetails({
      id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      courtId: 2,
      court: { id: 2, name: "Queen Elizabeth Park", latitude: 49.24, longitude: -123.11 },
    });
    const forecast = {
      at: booked.startsAt,
      temperature: 18.5,
      description: "light rain",
      icon: "10d",
      precipitationChance: 0.4,
    };
    mockedFetchUserGames.mockResolvedValue([booked, open]);
    mockedGetForecast.mockResolvedValueOnce(forecast).mockResolvedValueOnce(null);

    const response = await request(createApp())
      .get("/games/me")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.games).toHaveLength(2);
    expect(response.body.games[0]).toMatchObject({
      id: booked.id,
      status: GameStatus.BOOKED,
      court: booked.court,
      players: [{ id: userId, team: 1 }],
      rounds: [],
      forecast: { ...forecast, at: forecast.at.toISOString() },
    });
    // A forecast that cannot be loaded leaves the game in the list without one
    expect(response.body.games[1]).toMatchObject({
      id: open.id,
      forecast: null,
    });
    expect(mockedFetchUserGames).toHaveBeenCalledWith(userId, expect.any(Date));
    expect(mockedGetForecast).toHaveBeenNthCalledWith(
      2,
      open.court.latitude,
      open.court.longitude,
      open.startsAt,
    );
  });

  test("Returns an empty list when the user has no games", async () => {
    mockedFetchUserGames.mockResolvedValue([]);

    const response = await request(createApp())
      .get("/games/me")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ games: [] });
    expect(mockedGetForecast).not.toHaveBeenCalled();
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchUserGames.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .get("/games/me")
      .set("Authorization", authHeader);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: GET /games/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Returns the authenticated user's completed games with rating changes", async () => {
    const game = gameDetails({
      status: GameStatus.COMPLETED,
      rounds: [{ number: 1, team1Score: 6, team2Score: 4 }],
      players: [
        {
          id: userId,
          username: "ace",
          name: "Ace Player",
          rating: 1516,
          photoUrl: null,
          team: 1,
          acceptedAt: new Date(),
          ratingBefore: 1500,
          ratingAfter: 1516,
        },
      ],
    });
    mockedFetchUserHistory.mockResolvedValue([game]);

    const response = await request(createApp())
      .get("/games/history")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.games).toHaveLength(1);
    expect(response.body.games[0]).toMatchObject({
      id: game.id,
      status: GameStatus.COMPLETED,
      players: [{ id: userId, team: 1, ratingBefore: 1500, ratingAfter: 1516 }],
      rounds: [{ number: 1, team1Score: 6, team2Score: 4 }],
    });
    expect(mockedFetchUserHistory).toHaveBeenCalledWith(userId);
  });

  test("Returns an empty list when the user has no completed games", async () => {
    mockedFetchUserHistory.mockResolvedValue([]);

    const response = await request(createApp())
      .get("/games/history")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ games: [] });
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchUserHistory.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .get("/games/history")
      .set("Authorization", authHeader);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: getUserHistory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Fetches the user's completed games", async () => {
    const games = [gameDetails({ status: GameStatus.COMPLETED })];
    mockedFetchUserHistory.mockResolvedValue(games);

    await expect(getUserHistory(userId)).resolves.toBe(games);
    expect(mockedFetchUserHistory).toHaveBeenCalledWith(userId);
  });
});

describe("Mocked: DELETE /games", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedIsUserInGame.mockResolvedValue(true);
    mockedFetchGame.mockResolvedValue(existingGame());
  });

  const gameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";

  test("Deletes the game with the given ID", async () => {
    mockedDeleteGame.mockResolvedValue(true);

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(204);
    expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, gameId);
    expect(mockedDeleteGame).toHaveBeenCalledTimes(1);
    expect(mockedDeleteGame).toHaveBeenCalledWith(gameId);
  });

  // Input: a scheduled game that is already completed (or cancelled)
  // Expected status code: 409
  // Expected behavior: the game, its score and its rating changes are kept
  // Expected output: { error: "Game is already completed or cancelled", code: "GAME_CLOSED" }
  test("Returns 409 and keeps a completed scheduled game", async () => {
    mockedFetchGame.mockResolvedValue(existingGame({ status: GameStatus.COMPLETED }));
    mockedDeleteGame.mockResolvedValue(false);

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.Closed));
  });

  test("Returns 403 and keeps the game when the user is not in it", async () => {
    mockedIsUserInGame.mockResolvedValue(false);

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody(gameErrors.NotInGame));
    expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, gameId);
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  // Input: the ID of a game that does not exist
  // Expected status code: 404
  // Expected behavior: nothing is deleted
  // Expected output: { error: "Game not found", code: "GAME_NOT_FOUND" }
  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  // Input: the ID of a booked tournament game the caller plays in
  // Expected status code: 409
  // Expected behavior: the game is kept, since the bracket depends on it
  // Expected output: { error: "Tournament games cannot be cancelled", code: "TOURNAMENT_NOT_CANCELLABLE" }
  test("Returns 409 and keeps a tournament game", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({
        gameSource: GameSource.TOURNAMENT,
        status: GameStatus.BOOKED,
      }),
    );

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.TournamentNotCancellable));
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  test.each([
    ["a missing gameId", {}],
    ["an empty gameId", { gameId: "" }],
    ["a non-UUID gameId", { gameId: "not-a-uuid" }],
    ["a numeric gameId", { gameId: "123" }],
    ["multiple gameIds", { gameId: [gameId, gameId] }],
  ])("Rejects a query with %s", async (_description, query) => {
    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query(query);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedIsUserInGame).not.toHaveBeenCalled();
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  test("Returns 404 when the game is deleted before the delete", async () => {
    mockedDeleteGame.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record to delete not found", {
        code: "P2025",
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(404);
    // The service maps no Prisma error here, so errorHandler's generic fallback answers
    expect(response.body).toEqual({ error: "Not found", code: "NOT_FOUND" });
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedDeleteGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });

  test("Returns 500 when the membership check throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedIsUserInGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    expect(mockedDeleteGame).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("Mocked: cancelGame", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(joinableGame());
  });

  const gameId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  test("Throws NotFound without deleting when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    await expect(cancelGame(gameId, userId)).rejects.toMatchObject(gameErrors.NotFound);
    expect(mockedIsUserInGame).not.toHaveBeenCalled();
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  test("Throws TournamentNotCancellable without deleting a tournament game", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({ gameSource: GameSource.TOURNAMENT }),
    );
    mockedIsUserInGame.mockResolvedValue(true);

    await expect(cancelGame(gameId, userId)).rejects.toMatchObject(gameErrors.TournamentNotCancellable);
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  test("Deletes the game when the user is in it", async () => {
    mockedIsUserInGame.mockResolvedValue(true);
    mockedFetchGame.mockResolvedValue(existingGame({ id: gameId }));
    mockedDeleteGame.mockResolvedValue(true);

    await expect(cancelGame(gameId, userId)).resolves.toBeUndefined();
    expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, gameId);
    expect(mockedDeleteGame).toHaveBeenCalledWith(gameId);
  });

  test("Throws Closed when the scheduled game is already completed or cancelled", async () => {
    mockedIsUserInGame.mockResolvedValue(true);
    mockedFetchGame.mockResolvedValue(existingGame({ id: gameId, status: GameStatus.COMPLETED }));
    mockedDeleteGame.mockResolvedValue(false);

    await expect(cancelGame(gameId, userId)).rejects.toMatchObject(gameErrors.Closed);
  });

  test("Does not delete the game when the user is not in it", async () => {
    mockedIsUserInGame.mockResolvedValue(false);

    await expect(cancelGame(gameId, userId)).rejects.toMatchObject(gameErrors.NotInGame);
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedIsUserInGame.mockResolvedValue(true);
    mockedFetchGame.mockResolvedValue(existingGame({ id: gameId }));
    mockedDeleteGame.mockRejectedValue(error);

    await expect(cancelGame(gameId, userId)).rejects.toBe(error);
  });
});

describe("Mocked: getGame", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Returns the game details from the repository with the game's forecast", async () => {
    const game = gameDetails();
    const forecast = {
      at: game.startsAt,
      temperature: 21,
      description: "clear sky",
      icon: "01d",
      precipitationChance: 0,
    };
    mockedFetchGameDetails.mockResolvedValue(game);
    mockedGetForecast.mockResolvedValue(forecast);

    await expect(getGame(game.id)).resolves.toEqual({ ...game, forecast });
    expect(mockedFetchGameDetails).toHaveBeenCalledWith(game.id);
    expect(mockedGetForecast).toHaveBeenCalledWith(
      game.court.latitude,
      game.court.longitude,
      game.startsAt,
    );
  });

  test.each([GameStatus.COMPLETED, GameStatus.CANCELLED])(
    "Returns a %s game without asking for a forecast",
    async (status) => {
      const game = gameDetails({ status });
      mockedFetchGameDetails.mockResolvedValue(game);

      await expect(getGame(game.id)).resolves.toEqual({
        ...game,
        forecast: null,
      });
      expect(mockedGetForecast).not.toHaveBeenCalled();
    },
  );

  test("Throws NotFound when the game does not exist", async () => {
    mockedFetchGameDetails.mockResolvedValue(null);

    await expect(
      getGame("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"),
    ).rejects.toMatchObject(gameErrors.NotFound);
    expect(mockedGetForecast).not.toHaveBeenCalled();
  });
});

describe("Mocked: getFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Fetches the feed from now and adds each game's forecast", async () => {
    const game = gameDetails();
    const forecast = {
      at: game.startsAt,
      temperature: 21,
      description: "clear sky",
      icon: "01d",
      precipitationChance: 0,
    };
    mockedFetchFeedGames.mockResolvedValue([game]);
    mockedGetForecast.mockResolvedValue(forecast);

    const before = Date.now();
    await expect(getFeed()).resolves.toEqual([{ ...game, forecast }]);

    const [now] = mockedFetchFeedGames.mock.calls[0] as [Date];
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedFetchFeedGames.mockRejectedValue(error);

    await expect(getFeed()).rejects.toBe(error);
    expect(mockedGetForecast).not.toHaveBeenCalled();
  });
});

describe("Mocked: getUserGames", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Fetches the user's games from now and adds each game's forecast", async () => {
    const game = gameDetails({ status: GameStatus.BOOKED });
    const forecast = {
      at: game.startsAt,
      temperature: 21,
      description: "clear sky",
      icon: "01d",
      precipitationChance: 0,
    };
    mockedFetchUserGames.mockResolvedValue([game]);
    mockedGetForecast.mockResolvedValue(forecast);

    const before = Date.now();
    await expect(getUserGames(userId)).resolves.toEqual([{ ...game, forecast }]);

    const [calledUserId, now] = mockedFetchUserGames.mock.calls[0] as [
      string,
      Date,
    ];
    expect(calledUserId).toBe(userId);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedFetchUserGames.mockRejectedValue(error);

    await expect(getUserGames(userId)).rejects.toBe(error);
    expect(mockedGetForecast).not.toHaveBeenCalled();
  });
});

describe("Mocked: newGame", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const input = () => ({
    format: Format.DOUBLES,
    startsAt: new Date(futureStartsAt()),
    courtId: 7,
    gameSource: GameSource.MATCHED,
  });

  test("Creates the game with OPEN status and adds the creator to team 1", async () => {
    const gameInput = input();
    const createdGame = {
      id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      ...gameInput,
      status: GameStatus.OPEN,
      createdAt: new Date(),
    };
    mockedCreateGame.mockResolvedValue(createdGame);

    await expect(newGame(gameInput, userId)).resolves.toBe(createdGame);
    expect(mockedCreateGame).toHaveBeenCalledTimes(1);
    expect(mockedCreateGame).toHaveBeenCalledWith(
      { ...gameInput, status: GameStatus.OPEN },
      userId,
    );
  });

  test("Propagates errors from creating the game", async () => {
    const error = new Error("Database unavailable");
    mockedCreateGame.mockRejectedValue(error);

    await expect(newGame(input(), userId)).rejects.toBe(error);
  });
});

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });

const joinGameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";

// A scheduled game that players can still join
const joinableGame = (overrides: Partial<Game> = {}): Game => ({
  id: joinGameId,
  format: Format.SINGLES,
  startsAt: new Date(futureStartsAt()),
  courtId: 1,
  gameSource: GameSource.SCHEDULED,
  status: GameStatus.OPEN,
  createdAt: new Date(),
  ...overrides,
});

describe("Mocked: POST /games/join", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedAddPlayerToTeam.mockResolvedValue("added");
  });

  const validJoinBody = () => ({ gameId: joinGameId, team: 1 });

  test("Adds the authenticated user to the game", async () => {
    const body = validJoinBody();

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(body);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(mockedAddPlayerToTeam).toHaveBeenCalledTimes(1);
    expect(mockedAddPlayerToTeam).toHaveBeenCalledWith(
      body.gameId,
      userId,
      body.team,
      1,
      expect.any(Date),
    );
  });

  test("Joins team 2 of a doubles game with two spots per team", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({ format: Format.DOUBLES }),
    );

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send({ ...validJoinBody(), team: 2 });

    expect(response.status).toBe(204);
    expect(mockedAddPlayerToTeam).toHaveBeenCalledWith(
      joinGameId,
      userId,
      2,
      2,
      expect.any(Date),
    );
  });

  test.each([
    ["missing gameId", { gameId: undefined }],
    ["non-UUID gameId", { gameId: "not-a-uuid" }],
    ["missing team", { team: undefined }],
    ["team 0", { team: 0 }],
    ["team 3", { team: 3 }],
    ["negative team", { team: -1 }],
    ["non-integer team", { team: 1.5 }],
    ["string team", { team: "1" }],
    ["userId in the body", { userId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }],
    ["unknown field", { accepted: false }],
  ])("Rejects a body with %s", async (_description, overrides) => {
    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send({ ...validJoinBody(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedAddPlayerToTeam).not.toHaveBeenCalled();
  });

  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedAddPlayerToTeam).not.toHaveBeenCalled();
  });

  test.each([
    ["a matched game", { gameSource: GameSource.MATCHED }],
    ["a booked game", { status: GameStatus.BOOKED }],
    ["a completed game", { status: GameStatus.COMPLETED }],
    ["a cancelled game", { status: GameStatus.CANCELLED }],
    ["a game that has started", { startsAt: new Date(Date.now() - 60 * 1000) }],
  ])("Returns 409 for %s", async (_description, overrides) => {
    mockedFetchGame.mockResolvedValue(joinableGame(overrides));

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.NotJoinable));
    expect(mockedAddPlayerToTeam).not.toHaveBeenCalled();
  });

  test("Returns 409 when the team is full", async () => {
    mockedAddPlayerToTeam.mockResolvedValue("teamFull");

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.TeamFull));
  });

  test("Returns 409 when the game stops being joinable before the player is added", async () => {
    mockedAddPlayerToTeam.mockResolvedValue("notJoinable");

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.NotJoinable));
  });

  test("Returns 409 when the user is already in the game", async () => {
    mockedAddPlayerToTeam.mockRejectedValue(prismaError("P2002"));

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.AlreadyInGame));
  });

  test("Returns 404 when the user does not exist", async () => {
    mockedAddPlayerToTeam.mockRejectedValue(prismaError("P2003"));

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.GameOrUserNotFound));
  });

  test("Returns 500 for other Prisma errors", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // A code neither the service nor errorHandler's fallbacks map, e.g. a failed raw query
    mockedAddPlayerToTeam.mockRejectedValue(prismaError("P2010"));

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .post("/games/join")
      .set("Authorization", authHeader)
      .send(validJoinBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    expect(mockedAddPlayerToTeam).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("Mocked: POST /games/leave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedDeleteGameUser.mockResolvedValue();
  });

  const validLeaveBody = () => ({ gameId: joinGameId });

  test("Removes the authenticated user from the game", async () => {
    const body = validLeaveBody();

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(body);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(mockedDeleteGameUser).toHaveBeenCalledTimes(1);
    expect(mockedDeleteGameUser).toHaveBeenCalledWith(body.gameId, userId);
  });

  // Input: the ID of a tournament game the caller plays in
  // Expected status code: 409
  // Expected behavior: the caller stays in the game, so the bracket keeps full teams
  // Expected output: { error: "Players cannot leave a tournament game", code: "TOURNAMENT_NOT_LEAVABLE" }
  test("Returns 409 and keeps the user in a tournament game", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({
        gameSource: GameSource.TOURNAMENT,
        status: GameStatus.BOOKED,
      }),
    );

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.TournamentNotLeavable));
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  test("Lets the user leave a booked game 31 minutes before it starts", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({
        status: GameStatus.BOOKED,
        startsAt: new Date(Date.now() + 31 * 60 * 1000),
      }),
    );

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(204);
    expect(mockedDeleteGameUser).toHaveBeenCalledWith(joinGameId, userId);
  });

  test.each([
    ["missing gameId", { gameId: undefined }],
    ["non-UUID gameId", { gameId: "not-a-uuid" }],
    ["userId in the body", { userId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }],
    ["unknown field", { team: 1 }],
  ])("Rejects a body with %s", async (_description, overrides) => {
    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send({ ...validLeaveBody(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  test.each([GameStatus.COMPLETED, GameStatus.CANCELLED])(
    "Returns 409 when the game is %s",
    async (status) => {
      mockedFetchGame.mockResolvedValue(joinableGame({ status }));

      const response = await request(createApp())
        .post("/games/leave")
        .set("Authorization", authHeader)
        .send(validLeaveBody());

      expect(response.status).toBe(409);
      expect(response.body).toEqual(errorBody(gameErrors.Closed));
      expect(mockedDeleteGameUser).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["starts in 29 minutes", 29 * 60 * 1000],
    ["has already started", -60 * 1000],
  ])("Returns 409 when the game %s", async (_description, offsetMs) => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({ startsAt: new Date(Date.now() + offsetMs) }),
    );

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.TooLate));
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  test("Returns 404 when the user is not in the game", async () => {
    mockedDeleteGameUser.mockRejectedValue(prismaError("P2025"));

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.PlayerNotFound));
  });

  test("Returns 500 for other Prisma errors", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // A code neither the service nor errorHandler's fallbacks map, e.g. a failed raw query
    mockedDeleteGameUser.mockRejectedValue(prismaError("P2010"));

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });

  test("Returns 500 when the repository throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedDeleteGameUser.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send(validLeaveBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: joinGame", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Adds the user to a singles team with one spot", async () => {
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedAddPlayerToTeam.mockResolvedValue("added");

    await expect(joinGame(joinGameId, userId, 2)).resolves.toBeUndefined();
    expect(mockedFetchGame).toHaveBeenCalledWith(joinGameId);
    expect(mockedAddPlayerToTeam).toHaveBeenCalledWith(
      joinGameId,
      userId,
      2,
      1,
      expect.any(Date),
    );
  });

  test("Throws TeamFull when the repository finds no free spot", async () => {
    mockedFetchGame.mockResolvedValue(joinableGame({ format: Format.DOUBLES }));
    mockedAddPlayerToTeam.mockResolvedValue("teamFull");

    await expect(joinGame(joinGameId, userId, 1)).rejects.toMatchObject(gameErrors.TeamFull);
  });

  test("Throws NotJoinable when the repository finds the game changed after it was checked", async () => {
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedAddPlayerToTeam.mockResolvedValue("notJoinable");

    await expect(joinGame(joinGameId, userId, 1)).rejects.toMatchObject(gameErrors.NotJoinable);
  });

  test("Passes the repository the same time it checked the start time against", async () => {
    const game = joinableGame({ startsAt: new Date(Date.now() + 60 * 1000) });
    mockedFetchGame.mockResolvedValue(game);
    mockedAddPlayerToTeam.mockResolvedValue("added");
    const before = Date.now();

    await joinGame(joinGameId, userId, 1);

    const [, , , , now] = mockedAddPlayerToTeam.mock.calls[0] as [
      string,
      string,
      number,
      number,
      Date,
    ];
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
    expect(now.getTime()).toBeLessThan(game.startsAt.getTime());
  });

  test("Throws NotFound without adding the user when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    await expect(joinGame(joinGameId, userId, 1)).rejects.toMatchObject(gameErrors.NotFound);
    expect(mockedAddPlayerToTeam).not.toHaveBeenCalled();
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedAddPlayerToTeam.mockRejectedValue(error);

    await expect(joinGame(joinGameId, userId, 1)).rejects.toBe(error);
  });
});

describe("Mocked: leaveGame", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Deletes the game user through the repository", async () => {
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedDeleteGameUser.mockResolvedValue();

    await expect(leaveGame(joinGameId, userId)).resolves.toBeUndefined();
    expect(mockedDeleteGameUser).toHaveBeenCalledWith(joinGameId, userId);
  });

  test("Throws TournamentNotLeavable without deleting when the game is in a tournament", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({ gameSource: GameSource.TOURNAMENT }),
    );

    await expect(leaveGame(joinGameId, userId)).rejects.toMatchObject(gameErrors.TournamentNotLeavable);
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  test("Throws TooLate without deleting when the game starts in less than 30 minutes", async () => {
    mockedFetchGame.mockResolvedValue(
      joinableGame({ startsAt: new Date(Date.now() + 10 * 60 * 1000) }),
    );

    await expect(leaveGame(joinGameId, userId)).rejects.toMatchObject(gameErrors.TooLate);
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedFetchGame.mockResolvedValue(joinableGame());
    mockedDeleteGameUser.mockRejectedValue(error);

    await expect(leaveGame(joinGameId, userId)).rejects.toBe(error);
  });
});

const editGameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";

const existingGame = (overrides: Partial<Game> = {}): Game => ({
  id: editGameId,
  format: Format.SINGLES,
  startsAt: new Date(futureStartsAt()),
  courtId: 1,
  gameSource: GameSource.SCHEDULED,
  status: GameStatus.OPEN,
  createdAt: new Date(),
  ...overrides,
});

// Every edit route runs the same game, membership and status checks before changing anything
describe.each([
  [
    "PATCH /games/time",
    () =>
      request(createApp())
        .patch("/games/time")
        .set("Authorization", authHeader)
        .send({ gameId: editGameId, startsAt: futureStartsAt() }),
  ],
  [
    "PATCH /games/location",
    () =>
      request(createApp())
        .patch("/games/location")
        .set("Authorization", authHeader)
        .send({ gameId: editGameId, courtId: 2 }),
  ],
  [
    "POST /games/score",
    () =>
      request(createApp())
        .post("/games/score")
        .set("Authorization", authHeader)
        .send({ gameId: editGameId, rounds: [[6, 4]] }),
  ],
] as const)("Mocked: %s edit checks", (_route, send) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame());
    mockedIsUserInGame.mockResolvedValue(true);
  });

  const expectNoChanges = () => {
    expect(mockedUpdateGame).not.toHaveBeenCalled();
    expect(mockedCompleteGame).not.toHaveBeenCalled();
  };

  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    const response = await send();

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedIsUserInGame).not.toHaveBeenCalled();
    expectNoChanges();
  });

  test("Returns 403 when the user is not in the game", async () => {
    mockedIsUserInGame.mockResolvedValue(false);

    const response = await send();

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody(gameErrors.NotInGame));
    expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, editGameId);
    expectNoChanges();
  });

  test.each([GameStatus.COMPLETED, GameStatus.CANCELLED])(
    "Returns 409 when the game is %s",
    async (status) => {
      mockedFetchGame.mockResolvedValue(existingGame({ status }));

      const response = await send();

      expect(response.status).toBe(409);
      expect(response.body).toEqual(errorBody(gameErrors.Closed));
      expectNoChanges();
    },
  );

  test("Returns 500 when fetching the game throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await send();

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    expectNoChanges();
    consoleError.mockRestore();
  });
});

describe("Mocked: PATCH /games/time", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame());
    mockedIsUserInGame.mockResolvedValue(true);
  });

  const validTimeBody = () => ({
    gameId: editGameId,
    startsAt: futureStartsAt(),
  });

  test.each([GameStatus.OPEN, GameStatus.BOOKED])(
    "Moves a %s game to the new start time",
    async (status) => {
      const body = validTimeBody();
      mockedFetchGame.mockResolvedValue(existingGame({ status }));
      mockedUpdateGame.mockResolvedValue(
        existingGame({ status, startsAt: new Date(body.startsAt) }),
      );

      const response = await request(createApp())
        .patch("/games/time")
        .set("Authorization", authHeader)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.game).toMatchObject({
        id: editGameId,
        status,
        startsAt: body.startsAt,
      });
      expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, editGameId);
      expect(mockedUpdateGame).toHaveBeenCalledTimes(1);
      expect(mockedUpdateGame).toHaveBeenCalledWith(editGameId, {
        startsAt: new Date(body.startsAt),
      });
    },
  );

  test.each([
    ["missing gameId", { gameId: undefined }],
    ["non-UUID gameId", { gameId: "not-a-uuid" }],
    ["missing startsAt", { startsAt: undefined }],
    ["non-ISO startsAt", { startsAt: "tomorrow" }],
    ["startsAt without offset", { startsAt: "2099-01-01T10:00:00" }],
    [
      "startsAt in the past",
      { startsAt: new Date(Date.now() - 60 * 1000).toISOString() },
    ],
    ["userId in the body", { userId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }],
    ["unknown field", { courtId: 2 }],
  ])("Rejects a body with %s", async (_description, overrides) => {
    const response = await request(createApp())
      .patch("/games/time")
      .set("Authorization", authHeader)
      .send({ ...validTimeBody(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });

  test("Returns 404 when the game is deleted before the update", async () => {
    mockedUpdateGame.mockRejectedValue(prismaError("P2025"));

    const response = await request(createApp())
      .patch("/games/time")
      .set("Authorization", authHeader)
      .send(validTimeBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
  });

  test("Returns 500 when the update throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedUpdateGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .patch("/games/time")
      .set("Authorization", authHeader)
      .send(validTimeBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: POST /games/start", () => {
  const bookedGame = (overrides: Partial<Game> = {}) =>
    existingGame({ status: GameStatus.BOOKED, ...overrides });

  const start = (body: object = { gameId: editGameId }) =>
    request(createApp())
      .post("/games/start")
      .set("Authorization", authHeader)
      .send(body);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(bookedGame());
    mockedIsUserInGame.mockResolvedValue(true);
  });

  // Input: a player starts a booked scheduled, matched or tournament game that starts tomorrow
  // Expected status code: 200
  // Expected behavior: the game's start time moves to now, checked against the time the game was checked at
  // Expected output: the started game
  test.each([GameSource.SCHEDULED, GameSource.MATCHED, GameSource.TOURNAMENT])(
    "Starts a booked %s game now",
    async (gameSource) => {
      mockedFetchGame.mockResolvedValue(bookedGame({ gameSource }));
      const before = Date.now();
      mockedStartBookedGame.mockImplementation((_gameId, now) =>
        Promise.resolve(bookedGame({ gameSource, startsAt: now })),
      );

      const response = await start();

      expect(response.status).toBe(200);
      expect(response.body.game).toMatchObject({
        id: editGameId,
        status: GameStatus.BOOKED,
        gameSource,
      });
      expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, editGameId);
      expect(mockedStartBookedGame).toHaveBeenCalledTimes(1);
      const [startedId, now] = mockedStartBookedGame.mock.calls[0] ?? [];
      expect(startedId).toBe(editGameId);
      expect(now?.getTime()).toBeGreaterThanOrEqual(before);
      expect(now?.getTime()).toBeLessThanOrEqual(Date.now());
      expect(response.body.game.startsAt).toBe(now?.toISOString());
    },
  );

  test.each([
    ["missing gameId", {}],
    ["non-UUID gameId", { gameId: "not-a-uuid" }],
    ["unknown field", { gameId: editGameId, startsAt: futureStartsAt() }],
  ])("Rejects a body with %s", async (_description, body) => {
    const response = await start(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedStartBookedGame).not.toHaveBeenCalled();
  });

  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    const response = await start();

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedIsUserInGame).not.toHaveBeenCalled();
    expect(mockedStartBookedGame).not.toHaveBeenCalled();
  });

  test("Returns 403 when the user is not in the game", async () => {
    mockedIsUserInGame.mockResolvedValue(false);

    const response = await start();

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody(gameErrors.NotInGame));
    expect(mockedStartBookedGame).not.toHaveBeenCalled();
  });

  // Input: a booked game whose start time passed a minute ago, which nobody started
  // Expected status code: 200
  // Expected behavior: games never start on their own, so it can still be started, late
  // Expected output: the started game
  test("Starts a booked game whose start time has passed", async () => {
    mockedFetchGame.mockResolvedValue(bookedGame({ startsAt: new Date(Date.now() - 60 * 1000) }));
    mockedStartBookedGame.mockImplementation((_gameId, now) =>
      Promise.resolve(bookedGame({ status: GameStatus.IN_PROGRESS, startsAt: now })),
    );

    const response = await start();

    expect(response.status).toBe(200);
    expect(response.body.game).toMatchObject({ id: editGameId, status: GameStatus.IN_PROGRESS });
    expect(mockedStartBookedGame).toHaveBeenCalledTimes(1);
  });

  // Input: a player starts a booked game
  // Expected behavior: the start is announced with when it started, so its players stop showing as playing to
  // their friends once the playing window runs out
  // Expected output: gameChanged with the game and its new start time
  test("Announces when the game started", async () => {
    const gameChanged = jest.spyOn(changes, "gameChanged");
    mockedStartBookedGame.mockImplementation((_gameId, now) =>
      Promise.resolve(bookedGame({ status: GameStatus.IN_PROGRESS, startsAt: now })),
    );

    await start();

    const [startedAt] = mockedStartBookedGame.mock.calls.map(([, now]) => now);
    expect(gameChanged).toHaveBeenCalledWith({ gameId: editGameId, startedAt });
    gameChanged.mockRestore();
  });

  // Input: games that can't start: closed, still open (free spots or unanswered match), or already in progress
  // Expected status code: 409
  // Expected behavior: the start time is not changed
  // Expected output: the reason, e.g. { error: "Game has already started", code: "GAME_ALREADY_STARTED" }
  test.each([
    ["completed", { status: GameStatus.COMPLETED }, gameErrors.Closed],
    ["cancelled", { status: GameStatus.CANCELLED }, gameErrors.Closed],
    ["open scheduled", { status: GameStatus.OPEN }, gameErrors.NotBooked],
    [
      "unanswered matched",
      { status: GameStatus.OPEN, gameSource: GameSource.MATCHED },
      gameErrors.NotBooked,
    ],
    ["in progress", { status: GameStatus.IN_PROGRESS }, gameErrors.AlreadyStarted],
  ] as const)("Returns 409 for a %s game", async (_description, overrides, error) => {
    mockedFetchGame.mockResolvedValue(bookedGame(overrides));

    const response = await start();

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(error));
    expect(mockedStartBookedGame).not.toHaveBeenCalled();
  });

  // Input: two players tap Start now at once, and the other one's update lands first
  // Expected status code: 409
  // Expected output: { error: "Game has already started", code: "GAME_ALREADY_STARTED" }
  test("Returns 409 when another player starts the game first", async () => {
    mockedStartBookedGame.mockResolvedValue(null);
    mockedFetchGame
      .mockResolvedValueOnce(bookedGame())
      .mockResolvedValueOnce(bookedGame({ status: GameStatus.IN_PROGRESS, startsAt: new Date() }));

    const response = await start();

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.AlreadyStarted));
  });

  test("Returns 409 when the game is completed before the update", async () => {
    mockedStartBookedGame.mockResolvedValue(null);
    mockedFetchGame
      .mockResolvedValueOnce(bookedGame())
      .mockResolvedValueOnce(bookedGame({ status: GameStatus.COMPLETED }));

    const response = await start();

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.Closed));
  });

  test("Returns 404 when the game is deleted before the update", async () => {
    mockedStartBookedGame.mockResolvedValue(null);
    mockedFetchGame.mockResolvedValueOnce(bookedGame()).mockResolvedValueOnce(null);

    const response = await start();

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
  });

  test("Returns 500 when the update throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedStartBookedGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await start();

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: startGame", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame({ status: GameStatus.BOOKED }));
    mockedIsUserInGame.mockResolvedValue(true);
  });

  test("Returns the started game", async () => {
    const started = existingGame({ status: GameStatus.BOOKED, startsAt: new Date() });
    mockedStartBookedGame.mockResolvedValue(started);

    await expect(startGame(editGameId, userId)).resolves.toEqual(started);
  });

  test("Throws when the game is not booked", async () => {
    mockedFetchGame.mockResolvedValue(existingGame({ status: GameStatus.OPEN }));

    await expect(startGame(editGameId, userId)).rejects.toMatchObject(gameErrors.NotBooked);
    expect(mockedStartBookedGame).not.toHaveBeenCalled();
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedStartBookedGame.mockRejectedValue(error);

    await expect(startGame(editGameId, userId)).rejects.toBe(error);
  });
});

describe("Mocked: PATCH /games/location", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame());
    mockedIsUserInGame.mockResolvedValue(true);
  });

  const validLocationBody = () => ({ gameId: editGameId, courtId: 2 });

  test("Moves the game to the new court", async () => {
    mockedUpdateGame.mockResolvedValue(existingGame({ courtId: 2 }));

    const response = await request(createApp())
      .patch("/games/location")
      .set("Authorization", authHeader)
      .send(validLocationBody());

    expect(response.status).toBe(200);
    expect(response.body.game).toMatchObject({ id: editGameId, courtId: 2 });
    expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, editGameId);
    expect(mockedUpdateGame).toHaveBeenCalledTimes(1);
    expect(mockedUpdateGame).toHaveBeenCalledWith(editGameId, { courtId: 2 });
  });

  test.each([
    ["missing gameId", { gameId: undefined }],
    ["non-UUID gameId", { gameId: "not-a-uuid" }],
    ["missing courtId", { courtId: undefined }],
    ["non-integer courtId", { courtId: 1.5 }],
    ["non-positive courtId", { courtId: 0 }],
    ["string courtId", { courtId: "2" }],
    ["userId in the body", { userId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }],
    ["unknown field", { startsAt: futureStartsAt() }],
  ])("Rejects a body with %s", async (_description, overrides) => {
    const response = await request(createApp())
      .patch("/games/location")
      .set("Authorization", authHeader)
      .send({ ...validLocationBody(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });

  test("Returns 404 when the court does not exist", async () => {
    mockedUpdateGame.mockRejectedValue(prismaError("P2003"));

    const response = await request(createApp())
      .patch("/games/location")
      .set("Authorization", authHeader)
      .send(validLocationBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.CourtNotFound));
  });

  test("Returns 404 when the game is deleted before the update", async () => {
    mockedUpdateGame.mockRejectedValue(prismaError("P2025"));

    const response = await request(createApp())
      .patch("/games/location")
      .set("Authorization", authHeader)
      .send(validLocationBody());

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
  });

  test("Returns 500 for other Prisma errors", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // A code neither the service nor errorHandler's fallbacks map, e.g. a failed raw query
    mockedUpdateGame.mockRejectedValue(prismaError("P2010"));

    const response = await request(createApp())
      .patch("/games/location")
      .set("Authorization", authHeader)
      .send(validLocationBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: POST /games/score", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Only a game in progress can be scored
    mockedFetchGame.mockResolvedValue(existingGame({ status: GameStatus.IN_PROGRESS }));
    mockedIsUserInGame.mockResolvedValue(true);
  });

  const rounds: [number, number][] = [
    [6, 4],
    [3, 6],
    [7, 5],
  ];
  const validScoreBody = () => ({ gameId: editGameId, rounds });

  const ratingChanges = [
    { userId, ratingBefore: 1500, ratingAfter: 1512.5 },
    { userId: "other-user", ratingBefore: 1500, ratingAfter: 1487.5 },
  ];

  test("Saves the rounds and returns the completed game with rating changes", async () => {
    const savedRounds = rounds.map(([team1Score, team2Score], index) => ({
      gameId: editGameId,
      number: index + 1,
      team1Score,
      team2Score,
    }));
    mockedCompleteGame.mockResolvedValue({
      game: existingGame({ status: GameStatus.COMPLETED }),
      rounds: savedRounds,
      ratingChanges,
    });

    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send(validScoreBody());

    expect(response.status).toBe(200);
    expect(response.body.game).toMatchObject({
      id: editGameId,
      status: GameStatus.COMPLETED,
    });
    expect(response.body.rounds).toEqual(savedRounds);
    expect(response.body.ratingChanges).toEqual(ratingChanges);
    expect(mockedIsUserInGame).toHaveBeenCalledWith(userId, editGameId);
    expect(mockedCompleteGame).toHaveBeenCalledTimes(1);
    expect(mockedCompleteGame).toHaveBeenCalledWith(editGameId, rounds);
  });

  test("Accepts a single round", async () => {
    mockedCompleteGame.mockResolvedValue({
      game: existingGame({ status: GameStatus.COMPLETED }),
      rounds: [{ gameId: editGameId, number: 1, team1Score: 0, team2Score: 6 }],
      ratingChanges,
    });

    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send({ gameId: editGameId, rounds: [[0, 6]] });

    expect(response.status).toBe(200);
    expect(mockedCompleteGame).toHaveBeenCalledWith(editGameId, [[0, 6]]);
  });

  test("Returns 409 when the teams are not full", async () => {
    mockedCompleteGame.mockRejectedValue(
      new IncompleteTeamsError(Format.SINGLES, 1, 0),
    );

    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send(validScoreBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.IncompleteTeams));
  });

  test("Returns 409 when another report completes the game first", async () => {
    mockedCompleteGame.mockResolvedValue(null);

    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send(validScoreBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.Closed));
  });

  test.each([
    ["missing gameId", { gameId: undefined }],
    ["non-UUID gameId", { gameId: "not-a-uuid" }],
    ["missing rounds", { rounds: undefined }],
    [
      "rounds that are not an array",
      { rounds: { team1Score: 6, team2Score: 4 } },
    ],
    [
      "a negative score",
      {
        rounds: [
          [6, 4],
          [-1, 6],
          [6, 2],
        ],
      },
    ],
    ["a non-integer score", { rounds: [[6.5, 4]] }],
    ["a string score", { rounds: [["6", "4"]] }],
    ["a round with one score", { rounds: [[6]] }],
    ["a round with three scores", { rounds: [[6, 4, 2]] }],
    ["userId in the body", { userId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }],
    ["unknown field", { status: GameStatus.COMPLETED }],
  ])("Rejects a body with %s", async (_description, overrides) => {
    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send({ ...validScoreBody(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(response.body.details).toBeDefined();
    expect(mockedFetchGame).not.toHaveBeenCalled();
    expect(mockedCompleteGame).not.toHaveBeenCalled();
  });

  test.each([
    ["no rounds", [], "must have at least one round"],
    [
      "a tied round",
      [
        [6, 4],
        [5, 5],
        [6, 2],
      ],
      "round 2 is tied",
    ],
    [
      "no winner",
      [
        [6, 4],
        [4, 6],
      ],
      "must have a winner",
    ],
  ])("Rejects a score with %s", async (_description, badRounds, message) => {
    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send({ gameId: editGameId, rounds: badRounds });

    expect(response.status).toBe(400);
    expect(response.body.details.fieldErrors.rounds).toContain(message);
    expect(mockedCompleteGame).not.toHaveBeenCalled();
  });

  // Input: a valid score, while Postgres aborts the transaction as a deadlock
  // Expected status code: 409
  // Expected behavior: nothing is saved, so the player can report again
  // Expected output: { error: "The score could not be saved, please try again", code: "SCORE_CONFLICT" }
  test("Returns 409 when the transaction is aborted as a deadlock", async () => {
    mockedCompleteGame.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock", {
        code: "P2034",
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send(validScoreBody());

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.ScoreConflict));
  });

  test("Returns 500 when saving the score throws unexpectedly", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedCompleteGame.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(createApp())
      .post("/games/score")
      .set("Authorization", authHeader)
      .send(validScoreBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});

describe("Mocked: changeGameTime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame());
    mockedIsUserInGame.mockResolvedValue(true);
  });

  const startsAt = new Date(futureStartsAt());

  test("Updates the start time when the user can edit the game", async () => {
    const updatedGame = existingGame({ startsAt });
    mockedUpdateGame.mockResolvedValue(updatedGame);

    await expect(changeGameTime(editGameId, userId, startsAt)).resolves.toEqual(updatedGame);
    expect(mockedUpdateGame).toHaveBeenCalledWith(editGameId, { startsAt });
  });

  test("Throws the reason and does not update when the user cannot edit the game", async () => {
    mockedIsUserInGame.mockResolvedValue(false);

    await expect(changeGameTime(editGameId, userId, startsAt)).rejects.toMatchObject(gameErrors.NotInGame);
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedUpdateGame.mockRejectedValue(error);

    await expect(changeGameTime(editGameId, userId, startsAt)).rejects.toBe(
      error,
    );
  });
});

describe("Mocked: changeGameLocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame());
    mockedIsUserInGame.mockResolvedValue(true);
  });

  test("Updates the court when the user can edit the game", async () => {
    const updatedGame = existingGame({ courtId: 2 });
    mockedUpdateGame.mockResolvedValue(updatedGame);

    await expect(changeGameLocation(editGameId, userId, 2)).resolves.toEqual(updatedGame);
    expect(mockedUpdateGame).toHaveBeenCalledWith(editGameId, { courtId: 2 });
  });

  test("Throws the reason and does not update when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    await expect(changeGameLocation(editGameId, userId, 2)).rejects.toMatchObject(gameErrors.NotFound);
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedUpdateGame.mockRejectedValue(error);

    await expect(changeGameLocation(editGameId, userId, 2)).rejects.toBe(error);
  });
});

describe("Mocked: reportScore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Only a game in progress can be scored
    mockedFetchGame.mockResolvedValue(existingGame({ status: GameStatus.IN_PROGRESS }));
    mockedIsUserInGame.mockResolvedValue(true);
  });

  const rounds: [number, number][] = [
    [6, 4],
    [6, 3],
  ];

  // Input: games nobody started yet: an open one, and a booked one (even past its start time)
  // Expected behavior: nothing is saved, since a game is scored only once a player started it
  // Expected output: GAME_NOT_STARTED
  test.each([
    ["open", existingGame()],
    ["booked", existingGame({ status: GameStatus.BOOKED, startsAt: new Date(Date.now() - 60 * 60 * 1000) })],
  ])("Rejects a score for an %s game nobody started", async (_description, game) => {
    mockedFetchGame.mockResolvedValue(game);

    await expect(reportScore(editGameId, userId, rounds)).rejects.toMatchObject(gameErrors.NotStarted);
    expect(mockedCompleteGame).not.toHaveBeenCalled();
  });

  test("Completes the game with the given rounds", async () => {
    const completed = {
      game: existingGame({ status: GameStatus.COMPLETED }),
      rounds: [
        { gameId: editGameId, number: 1, team1Score: 6, team2Score: 4 },
        { gameId: editGameId, number: 2, team1Score: 6, team2Score: 3 },
      ],
      ratingChanges: [
        { userId, ratingBefore: 1500, ratingAfter: 1520 },
        { userId: "other-user", ratingBefore: 1500, ratingAfter: 1480 },
      ],
    };
    mockedCompleteGame.mockResolvedValue(completed);

    await expect(reportScore(editGameId, userId, rounds)).resolves.toEqual(completed);
    expect(mockedCompleteGame).toHaveBeenCalledWith(editGameId, rounds);
  });

  test("Throws the reason and does not save when the game is already completed", async () => {
    mockedFetchGame.mockResolvedValue(
      existingGame({ status: GameStatus.COMPLETED }),
    );

    await expect(reportScore(editGameId, userId, rounds)).rejects.toMatchObject(gameErrors.Closed);
    expect(mockedCompleteGame).not.toHaveBeenCalled();
  });

  test("Throws IncompleteTeams when the teams are not full", async () => {
    mockedCompleteGame.mockRejectedValue(
      new IncompleteTeamsError(Format.DOUBLES, 2, 1),
    );

    await expect(reportScore(editGameId, userId, rounds)).rejects.toMatchObject(gameErrors.IncompleteTeams);
  });

  test("Rethrows other errors from saving the score", async () => {
    mockedCompleteGame.mockRejectedValue(new Error("database down"));

    await expect(reportScore(editGameId, userId, rounds)).rejects.toThrow(
      "database down",
    );
  });

  test("Throws Closed when the game is completed between the check and the save", async () => {
    mockedCompleteGame.mockResolvedValue(null);

    await expect(reportScore(editGameId, userId, rounds)).rejects.toMatchObject(gameErrors.Closed);
  });

  test("Propagates repository errors", async () => {
    const error = new Error("Database unavailable");
    mockedCompleteGame.mockRejectedValue(error);

    await expect(reportScore(editGameId, userId, rounds)).rejects.toBe(error);
  });
});

describe("Mocked: POST /games/accept", () => {
  const opponentId = "opponent-user-id";
  const opponent = {
    id: opponentId,
    username: "rival",
    name: "Rival Player",
    rating: 1500,
    photoUrl: null,
    team: 2,
    acceptedAt: null,
    ratingBefore: null,
    ratingAfter: null,
  };
  const matchedGame = gameDetails({
    id: joinGameId,
    gameSource: GameSource.MATCHED,
    players: [...gameDetails().players, opponent],
  });

  const accept = () =>
    request(createApp())
      .post("/games/accept")
      .set("Authorization", authHeader)
      .send({ gameId: joinGameId });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(joinableGame({ gameSource: GameSource.MATCHED }));
    mockedIsUserInGame.mockResolvedValue(true);
    mockedAcceptMatch.mockResolvedValue("accepted");
    mockedFetchGameDetails.mockResolvedValue(matchedGame);
    mockedPushToUsers.mockResolvedValue(1);
  });

  // Input: a player accepts while the other player still hasn't answered
  // Expected status code: 204
  // Expected behavior: only the other player gets a push naming who accepted, which opens the game
  // Expected output: empty body
  test("Notifies the other players that the player accepted", async () => {
    const response = await accept();

    expect(response.status).toBe(204);
    expect(mockedPushToUsers).toHaveBeenCalledWith([opponentId], {
      title: "Match accepted",
      body: "Ace Player accepted your singles game at Kitsilano Beach Park.",
      data: { gameId: joinGameId },
    });
  });

  // Input: the last player accepts, so the game is booked
  // Expected status code: 204
  // Expected behavior: the other players get a push saying the game is booked
  // Expected output: empty body
  test("Notifies the other players that the game is booked when the last player accepts", async () => {
    mockedAcceptMatch.mockResolvedValue("booked");

    const response = await accept();

    expect(response.status).toBe(204);
    expect(mockedPushToUsers).toHaveBeenCalledWith([opponentId], {
      title: "Match confirmed!",
      body: "Everyone accepted. Your singles game at Kitsilano Beach Park is booked.",
      data: { gameId: joinGameId },
    });
  });

  // Input: a player accepts a match they already accepted, e.g. a retried request
  // Expected status code: 409
  // Expected behavior: the request is rejected and no second push is sent
  // Expected output: { error: "Match already accepted", code: "MATCH_ALREADY_ACCEPTED" }
  test("Returns 409 when the player already accepted the match", async () => {
    mockedAcceptMatch.mockResolvedValue("alreadyAccepted");

    const response = await accept();

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.AlreadyAccepted));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: sending the push fails
  // Expected status code: 204
  // Expected behavior: the error is logged, the acceptance still succeeds
  // Expected output: empty body
  test("Still accepts the match when the push fails", async () => {
    mockedPushToUsers.mockRejectedValue(new Error("FCM unavailable"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await accept();

    expect(response.status).toBe(204);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // Input: a player of a matched game waiting for answers accepts it
  // Expected status code: 204
  // Expected behavior: the acceptance is recorded for the authenticated user
  // Expected output: empty body
  test("Accepts the match for the authenticated user", async () => {
    const response = await request(createApp())
      .post("/games/accept")
      .set("Authorization", authHeader)
      .send({ gameId: joinGameId });

    expect(response.status).toBe(204);
    expect(mockedAcceptMatch).toHaveBeenCalledWith(joinGameId, userId, expect.any(Date));
  });

  // Input: a gameId that is not a UUID
  // Expected status code: 400
  // Expected behavior: nothing is recorded
  // Expected output: the validation error
  test("Rejects a body with a non-UUID gameId", async () => {
    const response = await request(createApp())
      .post("/games/accept")
      .set("Authorization", authHeader)
      .send({ gameId: "nope" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(mockedAcceptMatch).not.toHaveBeenCalled();
  });

  // Input: the game does not exist
  // Expected status code: 404
  // Expected behavior: nothing is recorded
  // Expected output: { error: "Game not found", code: "GAME_NOT_FOUND" }
  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGame.mockResolvedValue(null);

    const response = await request(createApp())
      .post("/games/accept")
      .set("Authorization", authHeader)
      .send({ gameId: joinGameId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedAcceptMatch).not.toHaveBeenCalled();
  });

  // Input: the user is not a player of the game
  // Expected status code: 403
  // Expected behavior: nothing is recorded
  // Expected output: { error: "User not in game", code: "NOT_IN_GAME" }
  test("Returns 403 when the user is not in the game", async () => {
    mockedIsUserInGame.mockResolvedValue(false);

    const response = await request(createApp())
      .post("/games/accept")
      .set("Authorization", authHeader)
      .send({ gameId: joinGameId });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody(gameErrors.NotInGame));
    expect(mockedAcceptMatch).not.toHaveBeenCalled();
  });

  // Input: the match was cancelled, booked or passed its answer cutoff
  // Expected status code: 409
  // Expected behavior: nothing is recorded
  // Expected output: { error: "Match is no longer waiting for answers", code: "MATCH_NOT_PENDING" }
  test("Returns 409 when the match is no longer waiting for answers", async () => {
    mockedAcceptMatch.mockResolvedValue("notPending");

    const response = await request(createApp())
      .post("/games/accept")
      .set("Authorization", authHeader)
      .send({ gameId: joinGameId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.NotPending));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });
});

describe("Mocked: matched games can be cancelled but not left or moved", () => {
  const opponentId = "opponent-user-id";
  const opponent = {
    id: opponentId,
    username: "rival",
    name: "Rival Player",
    rating: 1500,
    photoUrl: null,
    team: 2,
    acceptedAt: null,
    ratingBefore: null,
    ratingAfter: null,
  };
  const matchedGame = (status: GameStatus = GameStatus.OPEN) =>
    gameDetails({
      id: editGameId,
      gameSource: GameSource.MATCHED,
      status,
      players: [...gameDetails().players, opponent],
    });

  const cancel = () =>
    request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId: editGameId });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame({ gameSource: GameSource.MATCHED }));
    mockedIsUserInGame.mockResolvedValue(true);
    mockedCancelMatchedGame.mockResolvedValue(true);
    mockedFetchGameDetails.mockResolvedValue(matchedGame());
    mockedPushToUsers.mockResolvedValue(1);
  });

  // Input: a player cancels a matched game still waiting for answers
  // Expected status code: 204
  // Expected behavior: only the other player gets a push naming who cancelled, which opens the app
  // Expected output: empty body
  test("Notifies the other players that the player cancelled the match", async () => {
    const response = await cancel();

    expect(response.status).toBe(204);
    expect(mockedPushToUsers).toHaveBeenCalledTimes(1);
    expect(mockedPushToUsers).toHaveBeenCalledWith([opponentId], {
      title: "Match cancelled",
      body: "Ace Player cancelled your singles game at Kitsilano Beach Park.",
      data: { gameId: editGameId },
    });
  });

  // Input: a player cancels a matched game every player already accepted
  // Expected status code: 204
  // Expected behavior: the other player is still told it fell through
  // Expected output: empty body
  test("Notifies the other players when a booked match is cancelled", async () => {
    mockedFetchGameDetails.mockResolvedValue(matchedGame(GameStatus.BOOKED));

    const response = await cancel();

    expect(response.status).toBe(204);
    expect(mockedPushToUsers).toHaveBeenCalledWith([opponentId], {
      title: "Match cancelled",
      body: "Ace Player cancelled your singles game at Kitsilano Beach Park.",
      data: { gameId: editGameId },
    });
  });

  // Input: sending the push fails
  // Expected status code: 204
  // Expected behavior: the error is logged, the match is still cancelled
  // Expected output: empty body
  test("Still cancels the match when the push fails", async () => {
    mockedPushToUsers.mockRejectedValue(new Error("FCM unavailable"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await cancel();

    expect(response.status).toBe(204);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // Input: a player cancels a scheduled game
  // Expected status code: 204
  // Expected behavior: the game is deleted and nobody gets a match push
  // Expected output: empty body
  test("Sends nothing when cancelling a scheduled game", async () => {
    mockedFetchGame.mockResolvedValue(existingGame({ gameSource: GameSource.SCHEDULED }));
    mockedDeleteGame.mockResolvedValue(true);

    const response = await cancel();

    expect(response.status).toBe(204);
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: a player cancels a matched game that is already closed
  // Expected status code: 409
  // Expected behavior: nobody is notified
  // Expected output: { error: "Game is already completed or cancelled", code: "GAME_CLOSED" }
  test("Sends nothing when the matched game was already closed", async () => {
    mockedCancelMatchedGame.mockResolvedValue(false);

    const response = await cancel();

    expect(response.status).toBe(409);
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: a player cancels a matched game that is still open
  // Expected status code: 204
  // Expected behavior: the game is marked cancelled, not deleted
  // Expected output: empty body
  test("DELETE /games marks a matched game cancelled instead of deleting it", async () => {
    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId: editGameId });

    expect(response.status).toBe(204);
    expect(mockedCancelMatchedGame).toHaveBeenCalledWith(editGameId);
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  // Input: a player cancels a matched game that is already completed or cancelled
  // Expected status code: 409
  // Expected behavior: nothing changes
  // Expected output: { error: "Game is already completed or cancelled", code: "GAME_CLOSED" }
  test("DELETE /games returns 409 when the matched game is already closed", async () => {
    mockedCancelMatchedGame.mockResolvedValue(false);

    const response = await request(createApp())
      .delete("/games")
      .set("Authorization", authHeader)
      .query({ gameId: editGameId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.Closed));
    expect(mockedDeleteGame).not.toHaveBeenCalled();
  });

  // Input: a player tries to leave a matched game
  // Expected status code: 409
  // Expected behavior: the player stays in the game
  // Expected output: { error: "Matched games can't be left", code: "MATCHED_NOT_LEAVABLE" }
  test("POST /games/leave rejects a matched game", async () => {
    const response = await request(createApp())
      .post("/games/leave")
      .set("Authorization", authHeader)
      .send({ gameId: editGameId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.MatchedNotLeavable));
    expect(mockedDeleteGameUser).not.toHaveBeenCalled();
  });

  // Input: a player tries to move a matched game to another time
  // Expected status code: 409
  // Expected behavior: the game keeps its time
  // Expected output: { error: "Matched games can't be moved", code: "MATCHED_NOT_MOVABLE" }
  test("PATCH /games/time rejects a matched game", async () => {
    const response = await request(createApp())
      .patch("/games/time")
      .set("Authorization", authHeader)
      .send({ gameId: editGameId, startsAt: futureStartsAt() });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.MatchedNotMovable));
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });

  // Input: a player tries to move a matched game to another court
  // Expected status code: 409
  // Expected behavior: the game keeps its court
  // Expected output: { error: "Matched games can't be moved", code: "MATCHED_NOT_MOVABLE" }
  test("PATCH /games/location rejects a matched game", async () => {
    const response = await request(createApp())
      .patch("/games/location")
      .set("Authorization", authHeader)
      .send({ gameId: editGameId, courtId: 2 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.MatchedNotMovable));
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });
});

describe("Mocked: moving a game in progress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGame.mockResolvedValue(existingGame({ status: GameStatus.IN_PROGRESS, startsAt: new Date() }));
    mockedIsUserInGame.mockResolvedValue(true);
  });

  // Input: a player tries to move a game that is being played to another time or court
  // Expected status code: 409
  // Expected behavior: the game keeps its time and court, as the app's hidden buttons say
  // Expected output: { error: "Game has already started", code: "GAME_ALREADY_STARTED" }
  test.each([
    ["PATCH /games/time", { startsAt: futureStartsAt() }, "/games/time"],
    ["PATCH /games/location", { courtId: 2 }, "/games/location"],
  ] as const)("%s rejects a game in progress", async (_route, change, path) => {
    const response = await request(createApp())
      .patch(path)
      .set("Authorization", authHeader)
      .send({ gameId: editGameId, ...change });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.AlreadyStarted));
    expect(mockedUpdateGame).not.toHaveBeenCalled();
  });
});

describe("Mocked: POST /games/invite", () => {
  const inviteGameId = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";
  const friendId = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

  const friendship = (status: FriendshipStatus) => ({
    requesterId: userId,
    addresseeId: friendId,
    status,
    createdAt: new Date(),
    acceptedAt: status === FriendshipStatus.ACCEPTED ? new Date() : null,
  });

  const invite = (body: object = { gameId: inviteGameId, userId: friendId }) =>
    request(createApp())
      .post("/games/invite")
      .set("Authorization", authHeader)
      .send(body);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchGameDetails.mockResolvedValue(gameDetails());
    mockedFetchFriendship.mockResolvedValue(friendship(FriendshipStatus.ACCEPTED));
    mockedIsPushEnabled.mockReturnValue(true);
    mockedPushToUsers.mockResolvedValue(1);
  });

  // Input: the FIREBASE_* credentials are not set
  // Expected status code: 200
  // Expected behavior: no push is attempted, and the app is told the friend was not notified
  // Expected output: { notified: false }
  test("Returns notified false when push notifications are not configured", async () => {
    mockedIsPushEnabled.mockReturnValue(false);
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const response = await invite();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ notified: false });
    expect(mockedPushToUsers).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  // Input: a player of an open scheduled game invites a friend who has a push token
  // Expected status code: 200
  // Expected behavior: the friend gets a push that opens the game
  // Expected output: { notified: true }
  test("Sends the friend a push notification for the game", async () => {
    const response = await invite();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ notified: true });
    expect(mockedPushToUsers).toHaveBeenCalledWith([friendId], {
      title: "Game invite",
      body: "Ace Player invited you to a singles game at Kitsilano Beach Park.",
      data: { gameId: inviteGameId, type: "gameInvite" },
    });
  });

  // Input: the push reaches no device, because the friend has no token or FCM says it no longer exists
  // Expected status code: 200
  // Expected behavior: the app is told the friend was not notified
  // Expected output: { notified: false }
  test("Returns notified false when the push reaches no device", async () => {
    mockedPushToUsers.mockResolvedValue(0);

    const response = await invite();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ notified: false });
  });

  // Input: a userId that is not a UUID
  // Expected status code: 400
  // Expected behavior: nothing is sent
  // Expected output: the validation error
  test("Rejects a body with a non-UUID userId", async () => {
    const response = await invite({ gameId: inviteGameId, userId: "nope" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(commonErrors.InvalidRequest.message);
    expect(mockedFetchGameDetails).not.toHaveBeenCalled();
  });

  // Input: the game does not exist
  // Expected status code: 404
  // Expected behavior: nothing is sent
  // Expected output: { error: "Game not found", code: "GAME_NOT_FOUND" }
  test("Returns 404 when the game does not exist", async () => {
    mockedFetchGameDetails.mockResolvedValue(null);

    const response = await invite();

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(gameErrors.NotFound));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: the inviter is not a player of the game
  // Expected status code: 403
  // Expected behavior: nothing is sent
  // Expected output: { error: "User not in game", code: "NOT_IN_GAME" }
  test("Returns 403 when the inviter is not in the game", async () => {
    mockedFetchGameDetails.mockResolvedValue(gameDetails({ players: [] }));

    const response = await invite();

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody(gameErrors.NotInGame));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: the game is matched, booked or already started
  // Expected status code: 409
  // Expected behavior: nothing is sent
  // Expected output: { error: "Game is not open to join", code: "NOT_JOINABLE" }
  test.each([
    ["a matched game", { gameSource: GameSource.MATCHED }],
    ["a booked game", { status: GameStatus.BOOKED }],
    ["a game that started", { startsAt: new Date(Date.now() - 60 * 1000) }],
  ])("Returns 409 for %s", async (_name, overrides) => {
    mockedFetchGameDetails.mockResolvedValue(gameDetails(overrides));

    const response = await invite();

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.NotJoinable));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: the invited user is already a player of the game
  // Expected status code: 409
  // Expected behavior: nothing is sent
  // Expected output: { error: "User already in game", code: "ALREADY_IN_GAME" }
  test("Returns 409 when the friend is already in the game", async () => {
    const { players } = gameDetails();
    mockedFetchGameDetails.mockResolvedValue(
      gameDetails({
        players: [
          ...players,
          ...players.map((player) => ({ ...player, id: friendId, team: 2 })),
        ],
      }),
    );

    const response = await invite();

    expect(response.status).toBe(409);
    expect(response.body).toEqual(errorBody(gameErrors.AlreadyInGame));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: the users are not friends, or the request is still pending
  // Expected status code: 403
  // Expected behavior: nothing is sent
  // Expected output: { error: "Users are not friends", code: "NOT_FRIENDS" }
  test.each([
    ["no friendship", null],
    ["a pending request", friendship(FriendshipStatus.PENDING)],
  ])("Returns 403 with %s", async (_name, existing) => {
    mockedFetchFriendship.mockResolvedValue(existing);

    const response = await invite();

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody(gameErrors.NotFriends));
    expect(mockedPushToUsers).not.toHaveBeenCalled();
  });

  // Input: sending the push fails
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal server error", code: "INTERNAL_ERROR" }
  test("Returns 500 when the push cannot be sent", async () => {
    mockedPushToUsers.mockRejectedValue(new Error("FCM down"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await invite();

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});
