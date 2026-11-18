import { NextFunction, Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/requireAuth";
import { getCourts } from "./courts.service";

export const courtsRouter = Router();

courtsRouter.use((req: Request, res: Response, next: NextFunction) => {
  requireAuth(req, res, next);
});

courtsRouter.get("/", async (_req: Request, res: Response) => {
  const courts = await getCourts();
  res.status(200).json({ courts });
});
