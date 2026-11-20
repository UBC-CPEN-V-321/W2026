import { Router, type Request, type Response } from "express";
import { authedUserId, requireAuth } from "../auth/requireAuth";
import { parseRequest } from "../errors";
import { joinQueueSchema } from "./matchmaking.schemas";
import { getNearbyPlayers, getQueueEntry, joinQueue, leaveQueue, loadQueueEvent } from "./matchmaking.service";
import { queueStreams } from "./matchmaking.events";
import { streamRoute } from "../events/streamRoute";

export const matchmakingRouter = Router();

matchmakingRouter.use(requireAuth);

matchmakingRouter.post("/", async (req: Request, res: Response) => {
  const body = parseRequest(joinQueueSchema, req.body);
  const request = await joinQueue(authedUserId(req), body);
  res.status(201).json({ request });
});

matchmakingRouter.delete("/", async (req: Request, res: Response) => {
  await leaveQueue(authedUserId(req));
  res.sendStatus(204);
});

matchmakingRouter.get("/", async (req: Request, res: Response) => {
  const request = await getQueueEntry(authedUserId(req));
  res.status(200).json({ request });
});

matchmakingRouter.get("/nearby", async (req: Request, res: Response) => {
  const nearby = await getNearbyPlayers(authedUserId(req));
  res.status(200).json(nearby);
});

// Server-Sent Events stream of the caller's queue: "nearby" (or "notQueued") first, then again whenever anyone
// joins or leaves the queue, or a match takes players out of it
matchmakingRouter.get(
  "/events",
  streamRoute(queueStreams, async (req) => {
    const userId = authedUserId(req);
    return { key: userId, firstEvents: [await loadQueueEvent(userId)] };
  }),
);
