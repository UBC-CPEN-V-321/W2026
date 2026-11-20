import request from "supertest";
import { createApp } from "../../src/app";
import { signAccessToken } from "../../src/auth/tokens";
import {
  createRequest,
  deleteRequest,
  findRequest,
  getQueuedLocations,
  hasActiveMatch,
} from "../../src/matchmaking/matchmaking.repository";
import { queueStreams } from "../../src/matchmaking/matchmaking.events";
import { StreamTestServer } from "../streamServer";

process.env.JWT_SECRET = "test-jwt-secret";
// The searching player with the Play tab open, and another player who joins near them
const watcherId = "0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e";
const otherId = "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4";

jest.mock("../../src/matchmaking/matchmaking.repository", () => ({
  createRequest: jest.fn(),
  deleteRequest: jest.fn(),
  findRequest: jest.fn(),
  getQueuedLocations: jest.fn(),
  hasActiveMatch: jest.fn(),
}));

const mockedCreateRequest = jest.mocked(createRequest);
const mockedDeleteRequest = jest.mocked(deleteRequest);
const mockedFindRequest = jest.mocked(findRequest);
const mockedGetQueuedLocations = jest.mocked(getQueuedLocations);
const mockedHasActiveMatch = jest.mocked(hasActiveMatch);

// The watcher searches at UBC
const ubc = { latitude: 49.2606, longitude: -123.246 };
const watcherEntry = () => ({ format: "EITHER" as const, ...ubc, createdAt: new Date("2026-11-01T12:00:00.000Z") });
// About 6 km from UBC, and Surrey, over 10 km away
const kitsilano = { latitude: 49.26831, longitude: -123.16812 };
const surrey = { latitude: 49.1913, longitude: -122.849 };

interface NearbyData {
  center: { latitude: number; longitude: number };
  players: { latitude: number; longitude: number }[];
}

describe("Mocked: GET /matchmaking/events", () => {
  const server = new StreamTestServer();
  const watchQueue = () => server.watch("/matchmaking/events", watcherId);

  beforeAll(() => server.start());

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindRequest.mockImplementation((userId) =>
      Promise.resolve(userId === watcherId ? watcherEntry() : null),
    );
    mockedGetQueuedLocations.mockResolvedValue([surrey]);
    mockedHasActiveMatch.mockResolvedValue(false);
  });

  afterEach(() => {
    server.stopWatching();
    queueStreams.closeAll();
  });

  afterAll(() => server.close());

  // Input: a request without an access token
  // Expected status code: 401
  // Expected behavior: no stream is opened
  it("rejects a request without a token", async () => {
    const res = await request(createApp()).get("/matchmaking/events");

    expect(res.status).toBe(401);
    expect(queueStreams.isEmpty()).toBe(true);
  });

  // Input: a searching player opens the stream; one other player searches in Surrey, over 10 km away
  // Expected behavior: the current queue is sent right away, without the far player
  // Expected output: "nearby" with the watcher's center and no players
  it("sends the players searching nearby first", async () => {
    const events = await watchQueue();

    const first = await events.next();

    expect(first.event).toBe("nearby");
    expect(first.data as NearbyData).toEqual({ center: ubc, players: [] });
    expect(mockedGetQueuedLocations).toHaveBeenCalledWith(watcherId);
  });

  // Input: a player who isn't in the queue opens the stream
  // Expected output: "notQueued"
  it("says when the player isn't in the queue", async () => {
    mockedFindRequest.mockResolvedValue(null);
    const events = await watchQueue();

    expect((await events.next()).event).toBe("notQueued");
  });

  // Input: the watcher is searching; another player joins the queue in Kitsilano, about 6 km away
  // Expected behavior: the watcher's map gets the new player without asking (no polling)
  // Expected output: a second "nearby" with the new player's rounded point
  it("pushes a player who joins nearby", async () => {
    const events = await watchQueue();
    await events.next();
    mockedCreateRequest.mockResolvedValue({ format: "EITHER", ...kitsilano, createdAt: new Date() });
    mockedGetQueuedLocations.mockResolvedValue([surrey, kitsilano]);

    const joined = await request(createApp())
      .post("/matchmaking")
      .set("Authorization", `Bearer ${signAccessToken(otherId)}`)
      .send({ format: "EITHER", ...kitsilano });
    expect(joined.status).toBe(201);

    const update = await events.next();
    expect(update.event).toBe("nearby");
    expect((update.data as NearbyData).players).toEqual([{ latitude: 49.268, longitude: -123.168 }]);
  });

  // Input: the watcher is searching, then leaves the queue
  // Expected behavior: their stream says they are out of the queue
  // Expected output: "notQueued" after the first "nearby"
  it("pushes notQueued once the player leaves", async () => {
    const events = await watchQueue();
    await events.next();
    mockedDeleteRequest.mockResolvedValue();
    mockedFindRequest.mockResolvedValue(null);

    const left = await request(createApp())
      .delete("/matchmaking")
      .set("Authorization", `Bearer ${signAccessToken(watcherId)}`);
    expect(left.status).toBe(204);

    expect((await events.next()).event).toBe("notQueued");
  });
});
