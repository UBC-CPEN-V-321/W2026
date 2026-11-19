import type { Request, Response } from "express";
import { authedUserId } from "../auth/requireAuth";
import type { EventStreams, StreamEvent } from "./eventStreams";

/** What a stream route loads before its stream opens */
export interface StreamStart {
  // What the client watches, e.g. a game's ID
  key: string;
  // Sent right away, usually the current state
  firstEvents: StreamEvent[];
}

/**
 * A route handler for a Server-Sent Events stream. The first events are loaded before the stream opens, so a bad
 * request or a missing game is still a normal error response (an AppError, through errorHandler)
 * @param streams the streams this route adds to
 * @param start reads the request and loads the first events
 * @returns the handler, for a route behind requireAuth
 */
export function streamRoute(streams: EventStreams, start: (req: Request) => Promise<StreamStart>) {
  return async (req: Request, res: Response): Promise<void> => {
    const { key, firstEvents } = await start(req);
    streams.open(key, res, firstEvents, authedUserId(req));
  };
}
