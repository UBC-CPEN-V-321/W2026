import { Router, type Request, type Response } from "express";
import { authedUserId, requireAuth } from "../auth/requireAuth";
import { parseRequest } from "../errors";
import {
  createTournamentSchema,
  tournamentIdBodySchema,
  tournamentIdSchema,
} from "./tournaments.schemas";
import {
  cancelTournament,
  getTournament,
  getTournamentFeed,
  getUserTournaments,
  joinTournament,
  leaveTournament,
  newTournament,
} from "./tournaments.service";

export const tournamentsRouter = Router();

tournamentsRouter.use(requireAuth);

tournamentsRouter.post("/", async (req: Request, res: Response) => {
  const body = parseRequest(createTournamentSchema, req.body);
  const tournament = await newTournament(body, authedUserId(req));
  res.status(201).json({ tournament });
});

tournamentsRouter.get("/", async (req: Request, res: Response) => {
  const tournamentId = parseRequest(tournamentIdSchema, req.query.tournamentId);
  const tournament = await getTournament(tournamentId);
  res.status(200).json({ tournament });
});

tournamentsRouter.get("/feed", async (_req: Request, res: Response) => {
  const tournaments = await getTournamentFeed();
  res.status(200).json({ tournaments });
});

tournamentsRouter.get("/me", async (req: Request, res: Response) => {
  const tournaments = await getUserTournaments(authedUserId(req));
  res.status(200).json({ tournaments });
});

tournamentsRouter.post("/join", async (req: Request, res: Response) => {
  const { tournamentId } = parseRequest(tournamentIdBodySchema, req.body);
  await joinTournament(tournamentId, authedUserId(req));
  res.sendStatus(204);
});

tournamentsRouter.post("/leave", async (req: Request, res: Response) => {
  const { tournamentId } = parseRequest(tournamentIdBodySchema, req.body);
  await leaveTournament(tournamentId, authedUserId(req));
  res.sendStatus(204);
});

tournamentsRouter.delete("/", async (req: Request, res: Response) => {
  const tournamentId = parseRequest(tournamentIdSchema, req.query.tournamentId);
  await cancelTournament(tournamentId, authedUserId(req));
  res.sendStatus(204);
});
