import express, { type Express } from "express";
import { usersRouter } from "./users/users.controller";
import { gamesRouter } from "./games/games.controller";
import { friendsRouter } from "./friends/friends.controller";
import { courtsRouter } from "./courts/courts.controller";
import { matchmakingRouter } from "./matchmaking/matchmaking.controller";
import { leaderboardRouter, statsRouter } from "./ranking/ranking.controller";
import { tournamentsRouter } from "./tournaments/tournaments.controller";
import { AppError, commonErrors, errorHandler } from "./errors";
import { registerLiveUpdates } from "./live/live";

export function createApp(): Express {
  // Pushes announced changes to the clients watching them
  registerLiveUpdates();

  const app = express();

  app.use(express.json());

  app.use("/user", usersRouter);

  app.use("/games", gamesRouter);

  app.use("/friends", friendsRouter);

  app.use("/courts", courtsRouter);

  app.use("/matchmaking", matchmakingRouter);

  app.use("/leaderboard", leaderboardRouter);

  app.use("/stats", statsRouter);

  app.use("/tournaments", tournamentsRouter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(() => {
    throw new AppError(commonErrors.RouteNotFound);
  });

  app.use(errorHandler);

  return app;
}
