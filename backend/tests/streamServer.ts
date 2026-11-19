// A real HTTP server for event stream tests: supertest can't read a response that never ends, so these tests
// listen on a port and read the stream with fetch
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/auth/tokens";
import { EventReader } from "./mock/sseReader";

export class StreamTestServer {
  private server: Server | undefined;
  private baseUrl = "";
  private readonly aborts: AbortController[] = [];

  // For beforeAll
  async start(): Promise<void> {
    const server = createApp().listen(0);
    this.server = server;
    await once(server, "listening");
    this.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  /**
   * Opens a stream as a user
   * @param path e.g. "/games/events?gameId=..."
   * @param userId the user the request is signed as
   * @returns a reader of the stream's events
   * @throws Error if the stream doesn't open (not a 200 text/event-stream)
   */
  async watch(path: string, userId: string): Promise<EventReader> {
    const abort = new AbortController();
    this.aborts.push(abort);
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${signAccessToken(userId)}` },
      signal: abort.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !contentType.includes("text/event-stream") || !response.body) {
      throw new Error(`The stream at ${path} didn't open: ${response.status} ${contentType}`);
    }
    return new EventReader(response.body.getReader());
  }

  // Disconnects every stream opened so far, like clients leaving; for afterEach
  stopWatching(): void {
    for (const abort of this.aborts.splice(0)) {
      abort.abort();
    }
  }

  // For afterAll
  async close(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
}
