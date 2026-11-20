import request from "supertest";
import { createApp } from "../../src/app";
import { Format, FriendshipStatus, GameStatus } from "../../src/generated/prisma/enums";
import {
  createFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  fetchFriendship,
  fetchGamesInProgress,
} from "../../src/friends/friends.repository";
import { fetchGame, fetchGameDetails, isUserInGame, startBookedGame } from "../../src/games/games.repository";
import { friendStreams } from "../../src/friends/friends.events";
import { getForecast } from "../../src/external/weather";
import { signAccessToken } from "../../src/auth/tokens";
import { gameDetails, gameRow, testGameId as gameId, testPlayer } from "../fixtures";
import { StreamTestServer } from "../streamServer";

process.env.JWT_SECRET = "test-jwt-secret";
// The user watching their friends page, their friend, and someone who isn't their friend yet
const watcherId = "0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e";
const friendId = "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4";
const strangerId = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const friendsSince = new Date("2026-10-01T12:00:00.000Z");

jest.mock("../../src/friends/friends.repository", () => ({
  createFriendRequest: jest.fn(),
  fetchFriendRequests: jest.fn(),
  fetchFriends: jest.fn(),
  fetchFriendship: jest.fn(),
  fetchGamesInProgress: jest.fn(),
}));

jest.mock("../../src/games/games.repository", () => ({
  fetchGame: jest.fn(),
  fetchGameDetails: jest.fn(),
  isUserInGame: jest.fn(),
  startBookedGame: jest.fn(),
}));

jest.mock("../../src/external/weather", () => ({
  getForecast: jest.fn(),
}));

const mockedFetchFriends = jest.mocked(fetchFriends);
const mockedFetchFriendRequests = jest.mocked(fetchFriendRequests);
const mockedFetchFriendship = jest.mocked(fetchFriendship);
const mockedCreateFriendRequest = jest.mocked(createFriendRequest);
const mockedFetchGamesInProgress = jest.mocked(fetchGamesInProgress);
const mockedFetchGame = jest.mocked(fetchGame);
const mockedFetchGameDetails = jest.mocked(fetchGameDetails);
const mockedIsUserInGame = jest.mocked(isUserInGame);
const mockedStartBookedGame = jest.mocked(startBookedGame);

const user = (id: string, username: string) => ({ id, username, name: username, photoUrl: null, rating: 1500 });

// The friend's game against the stranger, once started
const startedDetails = () =>
  gameDetails({
    status: GameStatus.IN_PROGRESS,
    startsAt: new Date(),
    players: [testPlayer(friendId, 1), testPlayer(strangerId, 2)],
  });

interface FriendsEventData {
  friends: { id: string; playing: { gameId: string; courtName: string } | null }[];
}

interface RequestsEventData {
  incoming: { id: string }[];
  outgoing: { id: string }[];
}

describe("Mocked: GET /friends/events", () => {
  const server = new StreamTestServer();
  const watchFriendsPage = () => server.watch("/friends/events", watcherId);

  beforeAll(() => server.start());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getForecast).mockResolvedValue(null);
    // The watcher and the stranger each have one friend: each other's friend is the friend
    mockedFetchFriends.mockImplementation((id) =>
      Promise.resolve(
        id === watcherId || id === strangerId
          ? [{ ...user(friendId, "friend"), friendsSince }]
          : [{ ...user(watcherId, "watcher"), friendsSince }],
      ),
    );
    mockedFetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [] });
    mockedFetchGamesInProgress.mockResolvedValue([]);
  });

  afterEach(() => {
    server.stopWatching();
    friendStreams.closeAll();
  });

  afterAll(() => server.close());

  // Input: a request without an access token
  // Expected status code: 401
  // Expected behavior: no stream is opened
  // Expected output: an error body
  it("rejects a request without a token", async () => {
    const res = await request(createApp()).get("/friends/events");

    expect(res.status).toBe(401);
    expect(friendStreams.isEmpty()).toBe(true);
  });

  // Input: the watcher opens their friends page
  // Expected status code: 200
  // Expected behavior: the stream starts with the page's current state
  // Expected output: "friends" with the friend, not playing, then "requests" with no requests
  it("sends the current friends and requests first", async () => {
    const events = await watchFriendsPage();

    const friends = await events.next();
    expect(friends.event).toBe("friends");
    expect((friends.data as FriendsEventData).friends.map((f) => [f.id, f.playing])).toEqual([[friendId, null]]);

    const requests = await events.next();
    expect(requests).toEqual({ event: "requests", data: { incoming: [], outgoing: [] } });
  });

  // Input: a friend of the watcher starts a booked game with Start now
  // Expected status code: 200 for the start
  // Expected behavior: the watcher's page gets the friend as playing without asking for it
  // Expected output: "friends" where the friend is playing the game at its court
  it("sends the friends list again once a friend starts playing", async () => {
    const events = await watchFriendsPage();
    await events.next();
    await events.next();

    mockedFetchGame.mockResolvedValue(gameRow({ status: GameStatus.BOOKED }));
    mockedIsUserInGame.mockResolvedValue(true);
    mockedStartBookedGame.mockResolvedValue(gameRow({ status: GameStatus.IN_PROGRESS }));
    mockedFetchGameDetails.mockResolvedValue(startedDetails());
    mockedFetchGamesInProgress.mockResolvedValue([
      {
        userId: friendId,
        game: { id: gameId, format: Format.SINGLES, startsAt: new Date(), court: { name: "Kitsilano Beach Park" } },
      },
    ]);

    const start = await request(createApp())
      .post("/games/start")
      .set("Authorization", `Bearer ${signAccessToken(friendId)}`)
      .send({ gameId });
    expect(start.status).toBe(200);

    const update = await events.next();
    expect(update.event).toBe("friends");
    const [friend] = (update.data as FriendsEventData).friends;
    expect(friend?.playing).toEqual(expect.objectContaining({ gameId, courtName: "Kitsilano Beach Park" }));
  });

  // Input: someone sends the watcher a friend request
  // Expected status code: 201 for the request
  // Expected behavior: the watcher's page gets the new request without asking for it
  // Expected output: "friends", then "requests" with the incoming request
  it("sends the requests again once someone sends a friend request", async () => {
    const events = await watchFriendsPage();
    await events.next();
    await events.next();

    mockedFetchFriendship.mockResolvedValue(null);
    mockedCreateFriendRequest.mockResolvedValue({
      requesterId: strangerId,
      addresseeId: watcherId,
      status: FriendshipStatus.PENDING,
      createdAt: new Date(),
      acceptedAt: null,
    });
    mockedFetchFriendRequests.mockResolvedValue({
      incoming: [{ ...user(strangerId, "stranger"), requestedAt: new Date() }],
      outgoing: [],
    });

    const send = await request(createApp())
      .post("/friends/requests")
      .set("Authorization", `Bearer ${signAccessToken(strangerId)}`)
      .send({ userId: watcherId });
    expect(send.status).toBe(201);

    expect((await events.next()).event).toBe("friends");
    const requests = await events.next();
    expect(requests.event).toBe("requests");
    expect((requests.data as RequestsEventData).incoming.map((r) => r.id)).toEqual([strangerId]);
  });
});
