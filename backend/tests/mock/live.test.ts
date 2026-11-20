import { FakeResponse, settle } from "../fakeResponse";
import { gameChanged, tournamentChanged } from "../../src/events/changes";
import { registerLiveUpdates } from "../../src/live/live";
import { gameListStreams, gameStreams } from "../../src/games/games.events";
import { friendStreams } from "../../src/friends/friends.events";
import { tournamentStreams } from "../../src/tournaments/tournaments.events";
import { GameSource, GameStatus } from "../../src/generated/prisma/enums";
import {
  fetchFeedGames,
  fetchGameDetails,
  fetchUserGames,
  type GameDetails,
} from "../../src/games/games.repository";
import {
  fetchFeedTournaments,
  fetchTournamentDetails,
  fetchUserTournaments,
} from "../../src/tournaments/tournaments.repository";
import { fetchFriendRequests, fetchFriends, fetchGamesInProgress } from "../../src/friends/friends.repository";
import { getForecast } from "../../src/external/weather";
import {
  gameDetails as baseGameDetails,
  testGameId as gameId,
  testPlayer,
  testTournamentId as tournamentId,
  tournamentDetails,
} from "../fixtures";

jest.mock("../../src/games/games.repository", () => ({
  fetchFeedGames: jest.fn(),
  fetchGameDetails: jest.fn(),
  fetchUserGames: jest.fn(),
}));

jest.mock("../../src/tournaments/tournaments.repository", () => ({
  fetchFeedTournaments: jest.fn(),
  fetchTournamentDetails: jest.fn(),
  fetchUserTournaments: jest.fn(),
}));

jest.mock("../../src/friends/friends.repository", () => ({
  fetchFriendRequests: jest.fn(),
  fetchFriends: jest.fn(),
  fetchGamesInProgress: jest.fn(),
}));

jest.mock("../../src/external/weather", () => ({
  getForecast: jest.fn(),
}));

const mockedFetchGameDetails = jest.mocked(fetchGameDetails);
const mockedFetchFeedGames = jest.mocked(fetchFeedGames);
const mockedFetchUserGames = jest.mocked(fetchUserGames);
const mockedFetchTournamentDetails = jest.mocked(fetchTournamentDetails);
const mockedFetchFriends = jest.mocked(fetchFriends);

const alice = "0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e";
const bob = "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4";
const carol = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

// Alice against bob
const gameDetails = (overrides: Partial<GameDetails> = {}) =>
  baseGameDetails({ players: [testPlayer(alice, 1), testPlayer(bob, 2)], ...overrides });

// Opens a stream for a key and returns the client, so the test can see what it receives
function watch(streams: typeof gameListStreams, key: string): FakeResponse {
  const res = new FakeResponse();
  streams.open(key, res.asResponse(), [], key);
  return res;
}

describe("Mocked: live updates", () => {
  beforeAll(() => {
    registerLiveUpdates();
    // A second registration must not push everything twice
    registerLiveUpdates();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getForecast).mockResolvedValue(null);
    mockedFetchFeedGames.mockResolvedValue([]);
    mockedFetchUserGames.mockResolvedValue([]);
    jest.mocked(fetchFeedTournaments).mockResolvedValue([]);
    jest.mocked(fetchUserTournaments).mockResolvedValue([]);
    mockedFetchFriends.mockResolvedValue([]);
    jest.mocked(fetchFriendRequests).mockResolvedValue({ incoming: [], outgoing: [] });
    jest.mocked(fetchGamesInProgress).mockResolvedValue([]);
  });

  afterEach(() => {
    for (const streams of [gameStreams, gameListStreams, friendStreams, tournamentStreams]) {
      streams.closeAll();
    }
  });

  // Input: a game change while no screen is open anywhere
  // Expected behavior: nothing is looked up
  // Expected output: no repository calls
  test("does nothing when nobody is watching", async () => {
    gameChanged({ gameId });
    tournamentChanged({ tournamentId });
    await settle();

    expect(mockedFetchGameDetails).not.toHaveBeenCalled();
    expect(mockedFetchTournamentDetails).not.toHaveBeenCalled();
  });

  // Input: a change to a scheduled game, with its player alice and someone else (carol) on the Games tab
  // Expected behavior: the feed goes to everyone once; "mine" only to alice, whose games changed
  // Expected output: alice gets feed then mine, carol only feed; the feed is loaded once and the game once
  test("sends the feed to everyone and the player's own lists to the player", async () => {
    const aliceTab = watch(gameListStreams, alice);
    const carolTab = watch(gameListStreams, carol);
    mockedFetchGameDetails.mockResolvedValue(gameDetails());

    gameChanged({ gameId });
    await settle();

    expect(aliceTab.receivedNames().sort()).toEqual(["feed", "mine"]);
    expect(carolTab.receivedNames()).toEqual(["feed"]);
    expect(mockedFetchFeedGames).toHaveBeenCalledTimes(1);
    expect(mockedFetchUserGames).toHaveBeenCalledWith(alice, expect.any(Date));
    expect(mockedFetchUserGames).not.toHaveBeenCalledWith(carol, expect.any(Date));
  });

  // Input: a matched game changes (matched games are never on the feed)
  // Expected behavior: its player's games are sent again, the feed isn't loaded
  // Expected output: alice gets only "mine"
  test("leaves the feed alone for a game that isn't on it", async () => {
    const aliceTab = watch(gameListStreams, alice);
    mockedFetchGameDetails.mockResolvedValue(gameDetails({ gameSource: GameSource.MATCHED }));

    gameChanged({ gameId });
    await settle();

    expect(aliceTab.receivedNames()).toEqual(["mine"]);
    expect(mockedFetchFeedGames).not.toHaveBeenCalled();
  });

  // Input: a deleted game, with its players given, and both its screen and alice's Games tab open
  // Expected behavior: the players aren't looked up (the game is gone); the screen hears it is deleted
  // Expected output: gameDeleted on the game's screen; feed and mine on alice's tab
  test("uses the given players of a deleted game", async () => {
    const screen = watch(gameStreams, gameId);
    const aliceTab = watch(gameListStreams, alice);
    mockedFetchGameDetails.mockResolvedValue(null);

    gameChanged({ gameId, playerIds: [alice, bob], onFeed: true });
    await settle();

    expect(screen.events()).toEqual([`event: gameDeleted\ndata: {"gameId":"${gameId}"}\n\n`]);
    expect(aliceTab.receivedNames().sort()).toEqual(["feed", "mine"]);
    // Called once, for the game's own screen, not to find the players
    expect(mockedFetchGameDetails).toHaveBeenCalledTimes(1);
  });

  // Input: a game change while carol, a friend of alice, has her friends page open
  // Expected behavior: carol's friends page is sent again, since alice may have started or stopped playing
  // Expected output: carol gets friends and requests
  test("sends the friends page to the players' friends", async () => {
    const carolFriends = watch(friendStreams, carol);
    mockedFetchGameDetails.mockResolvedValue(gameDetails());
    mockedFetchFriends.mockImplementation((userId) =>
      Promise.resolve(
        userId === alice ? [{ id: carol, username: carol, name: carol, photoUrl: null, rating: 1500, friendsSince: new Date() }] : [],
      ),
    );

    gameChanged({ gameId });
    await settle();

    expect(carolFriends.receivedNames()).toEqual(["friends", "requests"]);
  });

  // Input: a change to a tournament's match, with the tournament's screen and a player's Games tab open
  // Expected behavior: the change goes to the tournament: its screen and every player's lists
  // Expected output: the screen gets tournamentUpdated; carol, in the tournament but not the game, gets mine
  test("sends a tournament match's change to its tournament", async () => {
    const screen = watch(tournamentStreams, tournamentId);
    const carolTab = watch(gameListStreams, carol);
    mockedFetchGameDetails.mockResolvedValue(
      gameDetails({
        gameSource: GameSource.TOURNAMENT,
        tournament: { id: tournamentId, name: "Fall Cup", round: 1 },
      }),
    );
    mockedFetchTournamentDetails.mockResolvedValue(tournamentDetails([alice, bob, carol]));

    gameChanged({ gameId });
    await settle();

    expect(screen.receivedNames()).toEqual(["tournamentUpdated"]);
    expect(carolTab.receivedNames().sort()).toEqual(["feed", "mine"]);
  });

  // Input: carol leaves a tournament (so she is no longer one of its players)
  // Expected behavior: her lists are still sent again, since she was named
  // Expected output: carol gets feed and mine
  test("sends the lists of a player named in a tournament change", async () => {
    const carolTab = watch(gameListStreams, carol);
    mockedFetchTournamentDetails.mockResolvedValue(tournamentDetails([alice]));

    tournamentChanged({ tournamentId, playerIds: [carol] });
    await settle();

    expect(carolTab.receivedNames().sort()).toEqual(["feed", "mine"]);
  });

  describe("when a started game's playing window runs out", () => {
    beforeEach(() => {
      // setImmediate stays real, so settle() still lets the promise chains run
      jest.useFakeTimers({ doNotFake: ["setImmediate"] });
      mockedFetchFriends.mockImplementation((userId) =>
        Promise.resolve(
          userId === alice ? [{ id: carol, username: carol, name: carol, photoUrl: null, rating: 1500, friendsSince: new Date() }] : [],
        ),
      );
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const threeHours = 3 * 60 * 60 * 1000;

    // Input: alice's game is started, carol (her friend) has her friends page open, then 3 hours pass
    // Expected behavior: the window ran out with the game still in progress, so carol's page is sent again
    // Expected output: friends and requests again, after the 3 hours and not before
    test("sends the players' friends pages again for a game still in progress", async () => {
      const carolFriends = watch(friendStreams, carol);
      mockedFetchGameDetails.mockResolvedValue(gameDetails({ status: GameStatus.IN_PROGRESS }));

      gameChanged({ gameId, startedAt: new Date() });
      await settle();
      carolFriends.written = [];

      jest.advanceTimersByTime(threeHours - 1000);
      await settle();
      expect(carolFriends.receivedNames()).toEqual([]);

      jest.advanceTimersByTime(1000);
      await settle();
      expect(carolFriends.receivedNames()).toEqual(["friends", "requests"]);
    });

    // Input: the same, but the game was scored (completed) before the 3 hours ran out
    // Expected behavior: its end already updated the pages, so nothing more is sent
    // Expected output: nothing new on carol's page
    test("sends nothing for a game that already ended", async () => {
      const carolFriends = watch(friendStreams, carol);
      mockedFetchGameDetails.mockResolvedValue(gameDetails({ status: GameStatus.IN_PROGRESS }));
      gameChanged({ gameId, startedAt: new Date() });
      await settle();
      carolFriends.written = [];

      mockedFetchGameDetails.mockResolvedValue(gameDetails({ status: GameStatus.COMPLETED }));
      jest.advanceTimersByTime(threeHours);
      await settle();

      expect(carolFriends.receivedNames()).toEqual([]);
    });

    // Input: a game is started while nobody has a friends page open, then 3 hours pass
    // Expected behavior: nothing is looked up when the window runs out
    // Expected output: no lookup of the game after the start
    test("looks nothing up when nobody has a friends page open", async () => {
      gameChanged({ gameId, startedAt: new Date() });
      await settle();
      mockedFetchGameDetails.mockClear();

      jest.advanceTimersByTime(threeHours);
      await settle();

      expect(mockedFetchGameDetails).not.toHaveBeenCalled();
    });
  });

  // Input: a game change whose lookup fails, while someone is on the Games tab
  // Expected behavior: the error is logged, not thrown
  // Expected output: console.error with the game's ID
  test("logs a game change it can't push", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    watch(gameListStreams, alice);
    mockedFetchGameDetails.mockRejectedValue(new Error("db down"));

    gameChanged({ gameId });
    await settle();

    expect(consoleError).toHaveBeenCalledWith(`Could not push the change of game ${gameId}`, expect.any(Error));
    consoleError.mockRestore();
  });

  // Input: a tournament change whose lookup fails, while someone is on the Games tab
  // Expected behavior: the error is logged, not thrown
  // Expected output: console.error with the tournament's ID
  test("logs a tournament change it can't push", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    watch(gameListStreams, alice);
    mockedFetchTournamentDetails.mockRejectedValue(new Error("db down"));

    tournamentChanged({ tournamentId });
    await settle();

    expect(consoleError).toHaveBeenCalledWith(
      `Could not push the change of tournament ${tournamentId}`,
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
