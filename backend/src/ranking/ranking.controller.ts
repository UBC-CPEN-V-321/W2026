import { Router, type Request, type Response } from "express";
import { authedUserId, requireAuth } from "../auth/requireAuth";
import { parseRequest } from "../errors";
import { leaderboardQuerySchema, statsQuerySchema } from "./ranking.schemas";
import { getLeaderboard, getPlayerStats } from "./ranking.service";

export const leaderboardRouter = Router();
export const statsRouter = Router();

leaderboardRouter.use(requireAuth);
statsRouter.use(requireAuth);

leaderboardRouter.get("/", async (req: Request, res: Response) => {
  const { limit } = parseRequest(leaderboardQuerySchema, req.query);
  const result = await getLeaderboard(authedUserId(req), limit);
  res.status(200).json(result);
});

statsRouter.get("/", async (req: Request, res: Response) => {
  const { userId } = parseRequest(statsQuerySchema, req.query);
  const stats = await getPlayerStats(userId ?? authedUserId(req));
  res.status(200).json({ stats });
});
