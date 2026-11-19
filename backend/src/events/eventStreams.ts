// Server-Sent Events: clients keep a response open and the server writes to it whenever what they watch changes,
// so nobody has to poll or reopen a page to see what other users did.
import type { Response } from "express";

// A comment line every 25 s keeps idle proxies from closing a stream and lets clients notice a dead connection
const HEARTBEAT_MS = 25_000;

// The ordering key of refreshEveryone; not a real key, since IDs are UUIDs
const EVERYONE = "*";

export interface StreamEvent {
  event: string;
  data: unknown;
}

/**
 * Writes one event to a stream
 * @param res the stream
 * @param event the event's name and its data, sent as JSON
 */
export function writeEvent(res: Response, { event, data }: StreamEvent): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * The open streams of one kind of thing being watched, e.g. games by game ID or friends lists by user ID
 */
export class EventStreams {
  private readonly streams = new Map<string, Set<Response>>();

  // The refresh still running for each key, so a key's updates are sent one after another, in order
  private readonly refreshes = new Map<string, Promise<void>>();

  /**
   * Turns a response into an event stream for a key, kept open until the client disconnects
   * @param key what the client watches
   * @param res the response the events are written to
   * @param firstEvents sent right away, usually the current state
   */
  open(key: string, res: Response, firstEvents: StreamEvent[]): void {
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Stops nginx-style proxies from buffering the events
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const keyStreams = this.streams.get(key) ?? new Set<Response>();
    keyStreams.add(res);
    this.streams.set(key, keyStreams);

    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

    // Fires when the client disconnects or the stream is ended (req's "close" fires as soon as the request is read)
    res.on("close", () => {
      clearInterval(heartbeat);
      keyStreams.delete(res);
      if (keyStreams.size === 0 && this.streams.get(key) === keyStreams) {
        this.streams.delete(key);
      }
    });

    for (const event of firstEvents) {
      writeEvent(res, event);
    }
  }

  /**
   * @param key what to check
   * @returns whether any client is watching the key
   */
  has(key: string): boolean {
    return (this.streams.get(key)?.size ?? 0) > 0;
  }

  /**
   * @returns whether no client is watching anything
   */
  isEmpty(): boolean {
    return this.streams.size === 0;
  }

  /**
   * Loads the current state of a key and sends it to every client watching it. Does nothing if nobody is.
   * Each refresh loads after the previous one for the key was sent, so an older state never arrives last.
   * Never throws: what changed is already saved, and a client that missed an update catches up when it reconnects
   * @param key what changed
   * @param load the events to send, read when the refresh runs
   */
  refresh(key: string, load: () => Promise<StreamEvent[]>): void {
    if (!this.has(key)) {
      return;
    }

    this.inOrder(key, async () => {
      const events = await load();
      for (const res of this.streams.get(key) ?? []) {
        for (const event of events) {
          writeEvent(res, event);
        }
      }
    });
  }

  /**
   * Loads one state and sends it to every open stream, whatever its key, e.g. a feed that is the same for
   * everyone: it is loaded once, not once per client. Does nothing if nobody is watching, never throws, and
   * keeps these refreshes in order like refresh does
   * @param load the events to send, read when the refresh runs
   */
  refreshEveryone(load: () => Promise<StreamEvent[]>): void {
    if (this.isEmpty()) {
      return;
    }

    this.inOrder(EVERYONE, async () => {
      const events = await load();
      for (const keyStreams of this.streams.values()) {
        for (const res of keyStreams) {
          for (const event of events) {
            writeEvent(res, event);
          }
        }
      }
    });
  }

  // Runs a refresh after the previous one for the same key, logging its errors instead of throwing them
  private inOrder(key: string, task: () => Promise<void>): void {
    const previous = this.refreshes.get(key) ?? Promise.resolve();
    const next = previous.then(task).catch((err: unknown) => {
      console.error(`Could not send the update of ${key} to its watchers`, err);
    });

    this.refreshes.set(key, next);
    void next.then(() => {
      if (this.refreshes.get(key) === next) {
        this.refreshes.delete(key);
      }
    });
  }

  /**
   * Ends every open stream, so the HTTP server can close on shutdown
   */
  closeAll(): void {
    for (const keyStreams of this.streams.values()) {
      for (const res of keyStreams) {
        res.end();
      }
    }
    this.streams.clear();
  }
}
