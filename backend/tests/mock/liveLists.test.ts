import request from "supertest";
import { createApp } from "../../src/app";
import { Format, GameSource, GameStatus } from "../../src/generated/prisma/enums";
import {
  addPlayerToTeam,
  createGame,
  deleteGame,
  fetchFeedGames,
  fetchGame,
  fetchGameDetails,
  fetchUserGames,
  type GameDetails,
  isUserInGame,
  startBookedGame,
} from "../../src/games/games.repository";
import {
  fetchFeedTournaments,
  fetchTournamentDetails,
  fetchUserTournaments,
  registerPlayer,
} from "../../src/tournaments/tournaments.repository";
import { tournamentErrors } from "../../src/tournaments/tournaments.service";
import { gameListStreams } from "../../src/games/games.events";
import { tournamentStreams } from "../../src/tournaments/tournaments.events";
import { errorBody } from "../../src/errors";
import { getForecast } from "../../src/external/weather";
import { signAccessToken } from "../../src/auth/tokens";
import {
  gameDetails as baseGameDetails,
  gameRow,
  testGameId as gameId,
  testPlayer as player,
  testTournamentId as tournamentId,
  tournamentDetails,
} from "../fixtures";
import { StreamTestServer } from "../streamServer";

process.env.JWT_SECRET = "test-jwt-secret";
const watcherId = "0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e";
const otherId = "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4";

jest.mock("../../src/games/games.repository", () => ({
  addPlayerToTeam: jest.fn(),
  createGame: jest.fn(),
  deleteGame: jest.fn(),
  fetchFeedGames: jest.fn(),
  fetchGame: jest.fn(),
  fetchGameDetails: jest.fn(),
  fetchUserGames: jest.fn(),
  isUserInGame: jest.fn(),
  startBookedGame: jest.fn(),
}));

jest.mock("../../src/tournaments/tournaments.repository", () => ({
  fetchFeedTournaments: jest.fn(),
  fetchTournamentDetails: jest.fn(),
  fetchUserTournaments: jest.fn(),
  registerPlayer: jest.fn(),
}));

jest.mock("../../src/external/weather", () => ({
  getForecast: jest.fn(),
}));

const mockedFetchGame = jest.mocked(fetchGame);
const mockedFetchGameDetails = jest.mocked(fetchGameDetails);
const mockedFetchFeedGames = jest.mocked(fetchFeedGames);
const mockedFetchUserGames = jest.mocked(fetchUserGames);
const mockedCreateGame = jest.mocked(createGame);
const mockedDeleteGame = jest.mocked(deleteGame);
const mockedAddPlayerToTeam = jest.mocked(addPlayerToTeam);
const mockedIsUserInGame = jest.mocked(isUserInGame);
const mockedStartBookedGame = jest.mocked(startBookedGame);
const mockedFetchTournamentDetails = jest.mocked(fetchTournamentDetails);
const mockedFetchFeedTournaments = jest.mocked(fetchFeedTournaments);
const mockedFetchUserTournaments = jest.mocked(fetchUserTournaments);
const mockedRegisterPlayer = jest.mocked(registerPlayer);

const startsAt = gameRow().startsAt;

// The other player's game, with them on team 1
const gameDetails = (overrides: Partial<GameDetails> = {}) =>
  baseGameDetails({ players: [player(otherId, 1)], ...overrides });

interface IdList {
  games: { id: string }[];
  tournaments: { id: string }[];
}

interface TournamentEventData {
  tournament: { id: string; players: { id: string }[] };
}

describe("Mocked: live tournament and Games tab streams", () => {
  const server = new StreamTestServer();
  const watch = (path: string, userId = watcherId) => server.watch(path, userId);

  beforeAll(() => server.start());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getForecast).mockResolvedValue(null);
    mockedFetchFeedGames.mockResolvedValue([]);
    mockedFetchUserGames.mockResolvedValue([]);
    mockedFetchFeedTournaments.mockResolvedValue([]);
    mockedFetchUserTournaments.mockResolvedValue([]);
  });

  afterEach(() => {
    server.stopWatching();
    tournamentStreams.closeAll();
    gameListStreams.closeAll();
  });

  afterAll(() => server.close());

  // Input: GET /tournaments/events for a tournament that does not exist
  // Expected status code: 404
  // Expected behavior: no stream is opened
  // Expected output: TOURNAMENT_NOT_FOUND
  it("returns 404 for a missing tournament", async () => {
    mockedFetchTournamentDetails.mockResolvedValue(null);

    const res = await request(createApp())
      .get("/tournaments/events")
      .query({ tournamentId })
      .set("Authorization", `Bearer ${signAccessToken(watcherId)}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(tournamentErrors.NotFound));
    expect(tournamentStreams.isEmpty()).toBe(true);
  });

  // Input: a watched tournament that another player joins
  // Expected status code: 200, and 204 for the join
  // Expected behavior: the watcher gets the tournament with the new player without asking for it
  // Expected output: tournamentUpdated with one player, then with both
  it("sends the tournament again once another player joins", async () => {
    mockedFetchTournamentDetails.mockResolvedValueOnce(tournamentDetails([watcherId]));
    const events = await watch(`/tournaments/events?tournamentId=${tournamentId}`);
    const first = await events.next();
    expect(first.event).toBe("tournamentUpdated");
    expect((first.data as TournamentEventData).tournament.players.map((p) => p.id)).toEqual([watcherId]);

    mockedRegisterPlayer.mockResolvedValue("registered");
    mockedFetchTournamentDetails.mockResolvedValue(tournamentDetails([watcherId, otherId]));
    const join = await request(createApp())
      .post("/tournaments/join")
      .set("Authorization", `Bearer ${signAccessToken(otherId)}`)
      .send({ tournamentId });
    expect(join.status).toBe(204);

    const update = await events.next();
    expect(update.event).toBe("tournamentUpdated");
    expect((update.data as TournamentEventData).tournament.players.map((p) => p.id)).toEqual([watcherId, otherId]);
  });

  // Input: a watched tournament one of whose matches its players start
  // Expected status code: 200 for the start
  // Expected behavior: the bracket's game changed, so the tournament is sent again
  // Expected output: a second tournamentUpdated
  it("sends the tournament again once one of its games changes", async () => {
    mockedFetchTournamentDetails.mockResolvedValue(tournamentDetails([watcherId, otherId]));
    const events = await watch(`/tournaments/events?tournamentId=${tournamentId}`);
    await events.next();

    const tournamentGame = gameRow({ gameSource: GameSource.TOURNAMENT, status: GameStatus.BOOKED });
    mockedFetchGame.mockResolvedValue(tournamentGame);
    mockedIsUserInGame.mockResolvedValue(true);
    mockedStartBookedGame.mockResolvedValue({ ...tournamentGame, status: GameStatus.IN_PROGRESS });
    mockedFetchGameDetails.mockResolvedValue(
      gameDetails({
        gameSource: GameSource.TOURNAMENT,
        status: GameStatus.IN_PROGRESS,
        tournament: { id: tournamentId, name: "Fall Cup", round: 1 },
      }),
    );

    const start = await request(createApp())
      .post("/games/start")
      .set("Authorization", `Bearer ${signAccessToken(otherId)}`)
      .send({ gameId });
    expect(start.status).toBe(200);

    expect((await events.next()).event).toBe("tournamentUpdated");
  });

  // Input: the Games tab is open, then another player creates a game
  // Expected status code: 200, and 201 for the new game
  // Expected behavior: the feed is sent first with "mine", then the feed again with the new game
  // Expected output: feed (empty), mine (empty), then feed with the game
  it("sends the feed again once another player creates a game", async () => {
    const events = await watch("/games/feed/events");
    expect((await events.next()).event).toBe("feed");
    expect((await events.next()).event).toBe("mine");

    mockedCreateGame.mockResolvedValue(gameRow());
    mockedFetchGameDetails.mockResolvedValue(gameDetails());
    mockedFetchFeedGames.mockResolvedValue([gameDetails()]);
    const create = await request(createApp())
      .post("/games")
      .set("Authorization", `Bearer ${signAccessToken(otherId)}`)
      .send({ format: Format.SINGLES, startsAt: startsAt.toISOString(), courtId: 1, gameSource: GameSource.SCHEDULED });
    expect(create.status).toBe(201);

    const feed = await events.next();
    expect(feed.event).toBe("feed");
    expect((feed.data as IdList).games.map((g) => g.id)).toEqual([gameId]);
  });

  // Input: the Games tab is open, then the watcher joins a game from another device
  // Expected status code: 204 for the join
  // Expected behavior: the game is now in the watcher's games, so "mine" is sent again (after the feed)
  // Expected output: feed, then mine with the game
  it("sends the user's games again once they join a game", async () => {
    const events = await watch("/games/feed/events");
    await events.next();
    await events.next();

    mockedFetchGame.mockResolvedValue(gameRow());
    mockedAddPlayerToTeam.mockResolvedValue("added");
    const joined = gameDetails({ players: [player(otherId, 1), player(watcherId, 2)], status: GameStatus.BOOKED });
    mockedFetchGameDetails.mockResolvedValue(joined);
    mockedFetchUserGames.mockResolvedValue([joined]);
    const join = await request(createApp())
      .post("/games/join")
      .set("Authorization", `Bearer ${signAccessToken(watcherId)}`)
      .send({ gameId, team: 2 });
    expect(join.status).toBe(204);

    const received = [await events.next(), await events.next()];
    const mine = received.find((e) => e.event === "mine");
    expect(received.map((e) => e.event).sort()).toEqual(["feed", "mine"]);
    expect((mine?.data as IdList).games.map((g) => g.id)).toEqual([gameId]);
  });

  // Input: the Games tab is open, then the other player cancels (deletes) a scheduled game the watcher is in
  // Expected status code: 204 for the cancel
  // Expected behavior: its players are found before it is deleted, so the watcher's games are sent again
  // Expected output: feed and mine, the game gone from both
  it("sends the lists again once a game the user is in is cancelled", async () => {
    const inGame = gameDetails({ players: [player(otherId, 1), player(watcherId, 2)], status: GameStatus.BOOKED });
    mockedFetchUserGames.mockResolvedValue([inGame]);
    const events = await watch("/games/feed/events");
    await events.next();
    await events.next();

    mockedFetchGame.mockResolvedValue(gameRow({ status: GameStatus.BOOKED }));
    mockedIsUserInGame.mockResolvedValue(true);
    mockedFetchGameDetails.mockResolvedValue(inGame);
    mockedDeleteGame.mockImplementation(() => {
      // Gone from here on
      mockedFetchGameDetails.mockResolvedValue(null);
      mockedFetchUserGames.mockResolvedValue([]);
      return Promise.resolve(true);
    });
    const cancel = await request(createApp())
      .delete("/games")
      .query({ gameId })
      .set("Authorization", `Bearer ${signAccessToken(otherId)}`);
    expect(cancel.status).toBe(204);

    const received = [await events.next(), await events.next()];
    expect(received.map((e) => e.event).sort()).toEqual(["feed", "mine"]);
    const mine = received.find((e) => e.event === "mine");
    expect((mine?.data as IdList).games).toEqual([]);
  });
});
