import { Router, type Request, type Response } from "express";
import { authedUserId, requireAuth } from "../auth/requireAuth";
import { parseRequest } from "../errors";
import { joinQueueSchema } from "./matchmaking.schemas";
import { getNearbyPlayers, getQueueEntry, joinQueue, leaveQueue } from "./matchmaking.service";

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
