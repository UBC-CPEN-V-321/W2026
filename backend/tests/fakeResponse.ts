// A fake Express response for event stream tests: the parts a stream uses, recording what was written
import { EventEmitter } from "node:events";
import type { Response } from "express";

export class FakeResponse extends EventEmitter {
  written: string[] = [];
  ended = false;
  statusCode = 0;
  headers: Record<string, string> = {};
  flushed = false;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  set(headers: Record<string, string>): this {
    this.headers = headers;
    return this;
  }

  flushHeaders(): void {
    this.flushed = true;
  }

  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }

  end(): this {
    this.ended = true;
    this.emit("close");
    return this;
  }

  // What the client would have received, without heartbeats
  events(): string[] {
    return this.written.filter((chunk) => !chunk.startsWith(":"));
  }

  // The names of the events received, in order
  receivedNames(): string[] {
    return this.events().map((chunk) => chunk.slice("event: ".length, chunk.indexOf("\n")));
  }

  asResponse(): Response {
    return this as unknown as Response;
  }
}

// Lets the promise chains of the streams and the live updates run: waits for the event loop to turn a few times
export function settle(rounds = 10): Promise<void> {
  let turns = Promise.resolve();
  for (let round = 0; round < rounds; round++) {
    turns = turns.then(() => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  return turns;
}
