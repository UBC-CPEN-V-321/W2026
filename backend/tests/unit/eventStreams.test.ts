import { FakeResponse, settle } from "../fakeResponse";
import { EventStreams, MAX_STREAMS_PER_USER, type StreamEvent, writeEvent } from "../../src/events/eventStreams";

const event = (name: string, data: unknown): StreamEvent => ({ event: name, data });

describe("Unit: writeEvent", () => {
  // Input: an event with JSON data
  // Expected output: the Server-Sent Events wire format, ended by a blank line
  test("writes the event name and its data as JSON", () => {
    const res = new FakeResponse();

    writeEvent(res.asResponse(), event("gameUpdated", { id: "g1" }));

    expect(res.written).toEqual(['event: gameUpdated\ndata: {"id":"g1"}\n\n']);
  });
});

describe("Unit: EventStreams", () => {
  let streams: EventStreams;

  beforeEach(() => {
    streams = new EventStreams();
  });

  afterEach(() => {
    streams.closeAll();
    jest.useRealTimers();
  });

  // Input: a client opens a stream with two first events
  // Expected behavior: the response becomes an event stream and is watched
  // Expected output: status 200, event-stream headers flushed, both events written
  test("opens a stream and sends its first events", () => {
    const res = new FakeResponse();

    streams.open("k1", res.asResponse(), [event("a", 1), event("b", 2)], "u1");

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.flushed).toBe(true);
    expect(res.events()).toEqual(["event: a\ndata: 1\n\n", "event: b\ndata: 2\n\n"]);
    expect(streams.has("k1")).toBe(true);
    expect(streams.isEmpty()).toBe(false);
  });

  // Input: two clients on one key, one on another, then a refresh of the first key
  // Expected behavior: the state is loaded once and only that key's clients get it
  // Expected output: both clients of k1 get the event, k2's client gets nothing new
  test("refresh sends to the key's clients only, loading once", async () => {
    const first = new FakeResponse();
    const second = new FakeResponse();
    const other = new FakeResponse();
    streams.open("k1", first.asResponse(), [], "u1");
    streams.open("k1", second.asResponse(), [], "u1");
    streams.open("k2", other.asResponse(), [], "u1");
    const load = jest.fn(() => Promise.resolve([event("x", "new")]));

    streams.refresh("k1", load);
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first.events()).toEqual(['event: x\ndata: "new"\n\n']);
    expect(second.events()).toEqual(['event: x\ndata: "new"\n\n']);
    expect(other.events()).toEqual([]);
  });

  // Input: a refresh of a key nobody watches
  // Expected behavior: nothing is loaded
  // Expected output: load is never called
  test("refresh does nothing when nobody watches the key", async () => {
    const load = jest.fn(() => Promise.resolve([event("x", 1)]));

    streams.refresh("nobody", load);
    await settle();

    expect(load).not.toHaveBeenCalled();
  });

  // Input: clients on two keys, then refreshEveryone
  // Expected behavior: the state is loaded once and every client gets it
  // Expected output: load called once, both clients get the event
  test("refreshEveryone loads once and sends to every client", async () => {
    const first = new FakeResponse();
    const other = new FakeResponse();
    streams.open("k1", first.asResponse(), [], "u1");
    streams.open("k2", other.asResponse(), [], "u1");
    const load = jest.fn(() => Promise.resolve([event("feed", [])]));

    streams.refreshEveryone(load);
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first.events()).toEqual(["event: feed\ndata: []\n\n"]);
    expect(other.events()).toEqual(["event: feed\ndata: []\n\n"]);
  });

  // Input: refreshEveryone with no client open
  // Expected behavior: nothing is loaded
  // Expected output: load is never called
  test("refreshEveryone does nothing when nobody watches", async () => {
    const load = jest.fn(() => Promise.resolve([event("feed", [])]));

    streams.refreshEveryone(load);
    await settle();

    expect(load).not.toHaveBeenCalled();
  });

  // Input: a slow refresh, then a fast one, of the same key
  // Expected behavior: the second loads only after the first was sent
  // Expected output: the events arrive in the order the refreshes were asked for
  test("keeps a key's refreshes in order", async () => {
    const res = new FakeResponse();
    streams.open("k1", res.asResponse(), [], "u1");
    let finishSlow: (events: StreamEvent[]) => void = () => undefined;
    const slow = new Promise<StreamEvent[]>((resolve) => {
      finishSlow = resolve;
    });

    streams.refresh("k1", () => slow);
    streams.refresh("k1", () => Promise.resolve([event("second", 2)]));
    await settle();
    finishSlow([event("first", 1)]);
    await settle();

    expect(res.events()).toEqual(["event: first\ndata: 1\n\n", "event: second\ndata: 2\n\n"]);
  });

  // Input: a refresh whose load fails, then another refresh
  // Expected behavior: the error is logged, not thrown, and the next refresh still runs
  // Expected output: console.error called, then the second event delivered
  test("logs a failed refresh and keeps going", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = new FakeResponse();
    streams.open("k1", res.asResponse(), [], "u1");

    streams.refresh("k1", () => Promise.reject(new Error("db down")));
    streams.refresh("k1", () => Promise.resolve([event("ok", true)]));
    await settle();

    expect(consoleError).toHaveBeenCalledWith("Could not send the update of k1 to its watchers", expect.any(Error));
    expect(res.events()).toEqual(["event: ok\ndata: true\n\n"]);
    consoleError.mockRestore();
  });

  // Input: one of two clients on a key disconnects, then the other
  // Expected behavior: the key is watched until its last client leaves
  // Expected output: has is true after the first close, false after the second
  test("forgets a key once its last client disconnects", () => {
    const first = new FakeResponse();
    const second = new FakeResponse();
    streams.open("k1", first.asResponse(), [], "u1");
    streams.open("k1", second.asResponse(), [], "u1");

    first.emit("close");
    expect(streams.has("k1")).toBe(true);

    second.emit("close");
    expect(streams.has("k1")).toBe(false);
    expect(streams.isEmpty()).toBe(true);
  });

  // Input: an open stream, then 25 s pass, then it closes and 25 s more pass
  // Expected behavior: a heartbeat comment every 25 s while open, none after
  // Expected output: one ": ping" line
  test("sends a heartbeat every 25 seconds while open", () => {
    jest.useFakeTimers();
    const res = new FakeResponse();
    streams.open("k1", res.asResponse(), [], "u1");

    jest.advanceTimersByTime(25_000);
    res.emit("close");
    jest.advanceTimersByTime(25_000);

    expect(res.written).toEqual([": ping\n\n"]);
  });

  // Input: one user opens one stream more than the limit, across two kinds of streams; another user opens one
  // Expected behavior: the user's oldest stream is closed, so they never hold more than the limit; others keep theirs
  // Expected output: only the first of the user's streams ended, the other user's stream still open
  test("closes a user's oldest stream past the limit", () => {
    const otherKind = new EventStreams();
    const opened: FakeResponse[] = [];
    for (let index = 0; index <= MAX_STREAMS_PER_USER; index++) {
      const res = new FakeResponse();
      // Every other stream on a second kind, since the limit counts every kind together
      (index % 2 === 0 ? streams : otherKind).open(`game-${index}`, res.asResponse(), [], "busy-user");
      opened.push(res);
    }
    const otherUser = new FakeResponse();
    streams.open("game-x", otherUser.asResponse(), [], "other-user");

    expect(opened.map((res) => res.ended)).toEqual([true, ...Array<boolean>(MAX_STREAMS_PER_USER).fill(false)]);
    expect(otherUser.ended).toBe(false);
    otherKind.closeAll();
  });

  // Input: a user at the limit closes one stream, then opens another
  // Expected behavior: the closed one freed its place
  // Expected output: none of the open streams is ended
  test("frees a user's place when a stream closes", () => {
    const opened: FakeResponse[] = [];
    for (let index = 0; index < MAX_STREAMS_PER_USER; index++) {
      const res = new FakeResponse();
      streams.open(`game-${index}`, res.asResponse(), [], "busy-user");
      opened.push(res);
    }

    opened[0]?.emit("close");
    streams.open("game-new", new FakeResponse().asResponse(), [], "busy-user");

    expect(opened.slice(1).some((res) => res.ended)).toBe(false);
  });

  // Input: open streams on two keys, then closeAll (server shutdown)
  // Expected behavior: every stream is ended and nothing is watched any more
  // Expected output: both responses ended, isEmpty true
  test("closeAll ends every stream", () => {
    const first = new FakeResponse();
    const other = new FakeResponse();
    streams.open("k1", first.asResponse(), [], "u1");
    streams.open("k2", other.asResponse(), [], "u1");

    streams.closeAll();

    expect(first.ended).toBe(true);
    expect(other.ended).toBe(true);
    expect(streams.isEmpty()).toBe(true);
  });
});
