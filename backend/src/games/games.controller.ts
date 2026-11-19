import { Router, type Request, type Response } from "express";
import { authedUserId, requireAuth } from "../auth/requireAuth";
import { parseRequest } from "../errors";
import {
  acceptMatchSchema,
  changeGameLocationSchema,
  changeGameTimeSchema,
  createGameSchema,
  gameIdSchema,
  inviteFriendSchema,
  joinGameSchema,
  leaveGameSchema,
  reportScoreSchema,
  startGameSchema,
} from "./games.schemas";
import {
  acceptMatch,
  cancelGame,
  changeGameLocation,
  changeGameTime,
  getFeed,
  getGame,
  getUserGames,
  getUserHistory,
  inviteFriend,
  joinGame,
  leaveGame,
  newGame,
  reportScore,
  startGame,
} from "./games.service";
import { gameListStreams, gameStreams } from "./games.events";
import { getGameListEvents } from "../live/live";

export const gamesRouter = Router();

gamesRouter.use(requireAuth);

gamesRouter.post("/", async (req: Request, res: Response) => {
  const body = parseRequest(createGameSchema, req.body);
  const game = await newGame(body, authedUserId(req));
  res.status(201).json({ game });
});

gamesRouter.get("/", async (req: Request, res: Response) => {
  const gameId = parseRequest(gameIdSchema, req.query.gameId);
  const game = await getGame(gameId);
  res.status(200).json({ game });
});

// Server-Sent Events stream of one game: its current state first, then the game each time it changes
gamesRouter.get("/events", async (req: Request, res: Response) => {
  const gameId = parseRequest(gameIdSchema, req.query.gameId);
  // Loaded before the stream opens, so a missing game is a normal 404
  const game = await getGame(gameId);
  gameStreams.open(gameId, res, [{ event: "gameUpdated", data: { game } }], authedUserId(req));
});

// Server-Sent Events stream of the caller's Games tab: "feed" (games and tournaments to join) and "mine" (their own
// games and tournaments) first, then each again whenever it changes
gamesRouter.get("/feed/events", async (req: Request, res: Response) => {
  const userId = authedUserId(req);
  // Loaded before the stream opens, so a database error is a normal 500
  const firstEvents = await getGameListEvents(userId);
  gameListStreams.open(userId, res, firstEvents, userId);
});

gamesRouter.get("/feed", async (_req: Request, res: Response) => {
  const games = await getFeed();
  res.status(200).json({ games });
});

gamesRouter.get("/me", async (req: Request, res: Response) => {
  const games = await getUserGames(authedUserId(req));
  res.status(200).json({ games });
});

gamesRouter.get("/history", async (req: Request, res: Response) => {
  const games = await getUserHistory(authedUserId(req));
  res.status(200).json({ games });
});

gamesRouter.delete("/", async (req: Request, res: Response) => {
  const gameId = parseRequest(gameIdSchema, req.query.gameId);
  await cancelGame(gameId, authedUserId(req));
  res.sendStatus(204);
});

gamesRouter.post("/join", async (req: Request, res: Response) => {
  const { gameId, team } = parseRequest(joinGameSchema, req.body);
  await joinGame(gameId, authedUserId(req), team);
  res.sendStatus(204);
});

gamesRouter.post("/leave", async (req: Request, res: Response) => {
  const { gameId } = parseRequest(leaveGameSchema, req.body);
  await leaveGame(gameId, authedUserId(req));
  res.sendStatus(204);
});

gamesRouter.post("/accept", async (req: Request, res: Response) => {
  const { gameId } = parseRequest(acceptMatchSchema, req.body);
  await acceptMatch(gameId, authedUserId(req));
  res.sendStatus(204);
});

gamesRouter.post("/invite", async (req: Request, res: Response) => {
  const { gameId, userId } = parseRequest(inviteFriendSchema, req.body);
  const { notified } = await inviteFriend(gameId, authedUserId(req), userId);
  res.status(200).json({ notified });
});

gamesRouter.patch("/time", async (req: Request, res: Response) => {
  const { gameId, startsAt } = parseRequest(changeGameTimeSchema, req.body);
  const game = await changeGameTime(gameId, authedUserId(req), startsAt);
  res.status(200).json({ game });
});

// Starts a booked game now, before its start time, so its players can report the score
gamesRouter.post("/start", async (req: Request, res: Response) => {
  const { gameId } = parseRequest(startGameSchema, req.body);
  const game = await startGame(gameId, authedUserId(req));
  res.status(200).json({ game });
});

gamesRouter.patch("/location", async (req: Request, res: Response) => {
  const { gameId, courtId } = parseRequest(changeGameLocationSchema, req.body);
  const game = await changeGameLocation(gameId, authedUserId(req), courtId);
  res.status(200).json({ game });
});

gamesRouter.post("/score", async (req: Request, res: Response) => {
  const { gameId, rounds } = parseRequest(reportScoreSchema, req.body);
  const { game, rounds: savedRounds, ratingChanges } = await reportScore(gameId, authedUserId(req), rounds);
  res.status(200).json({ game, rounds: savedRounds, ratingChanges });
});
