import { AppError, commonErrors, type ErrorDefinition, mapPrismaErrors } from "../errors";
import { isPushEnabled } from "../external/fcm";
import { getForecast } from "../external/weather";
import { fetchFriendship } from "../friends/friends.repository";
import {
  Format,
  FriendshipStatus,
  GameSource,
  GameStatus,
} from "../generated/prisma/enums";
import type { Game } from "../generated/prisma/client";
import { IncompleteTeamsError } from "../ranking/ranking.service";
import { pushToUsers } from "../users/users.service";
import {
  acceptMatch as recordAcceptance,
  addPlayerToTeam,
  cancelMatchedGame,
  completeGame,
  createGame,
  deleteGame,
  deleteGameUser,
  fetchFeedGames,
  fetchGame,
  fetchGameDetails,
  fetchUserGames,
  fetchUserHistory,
  type GameDetails,
  isUserInGame,
  startBookedGame,
  updateGame,
} from "./games.repository";
import {
  CreateGameInput,
  GameIdInput,
  ReportScoreInput,
} from "./games.schemas";
import { gameStreams } from "./games.events";
import { friendStreams } from "../friends/friends.events";
import { refreshFriendsOfPlayers } from "../friends/friends.service";

export const gameErrors = {
  NotFound: { status: 404, code: "GAME_NOT_FOUND", message: "Game not found" },
  NotInGame: { status: 403, code: "NOT_IN_GAME", message: "User not in game" },
  // Leaving a game the user is not in
  PlayerNotFound: { status: 404, code: "PLAYER_NOT_FOUND", message: "User not in game" },
  GameOrUserNotFound: { status: 404, code: "GAME_OR_USER_NOT_FOUND", message: "Game or user not found" },
  Closed: { status: 409, code: "GAME_CLOSED", message: "Game is already completed or cancelled" },
  IncompleteTeams: { status: 409, code: "INCOMPLETE_TEAMS", message: "Game does not have full teams" },
  MatchedNotMovable: { status: 409, code: "MATCHED_NOT_MOVABLE", message: "Matched games can't be moved" },
  MatchedNotLeavable: { status: 409, code: "MATCHED_NOT_LEAVABLE", message: "Matched games can't be left" },
  TournamentNotLeavable: {
    status: 409,
    code: "TOURNAMENT_NOT_LEAVABLE",
    message: "Players cannot leave a tournament game",
  },
  TournamentNotCancellable: {
    status: 409,
    code: "TOURNAMENT_NOT_CANCELLABLE",
    message: "Tournament games cannot be cancelled",
  },
  NotJoinable: { status: 409, code: "NOT_JOINABLE", message: "Game is not open to join" },
  TeamFull: { status: 409, code: "TEAM_FULL", message: "Team is full" },
  AlreadyInGame: { status: 409, code: "ALREADY_IN_GAME", message: "User already in game" },
  TooLate: { status: 409, code: "LEAVE_TOO_LATE", message: "Game starts in less than 30 minutes" },
  NotPending: { status: 409, code: "MATCH_NOT_PENDING", message: "Match is no longer waiting for answers" },
  AlreadyAccepted: { status: 409, code: "MATCH_ALREADY_ACCEPTED", message: "Match already accepted" },
  NotBooked: {
    status: 409,
    code: "GAME_NOT_BOOKED",
    message: "Only a booked game can start: every spot must be filled and every player must accept",
  },
  AlreadyStarted: { status: 409, code: "GAME_ALREADY_STARTED", message: "Game has already started" },
  NotFriends: { status: 403, code: "NOT_FRIENDS", message: "Users are not friends" },
  // Two games sharing a player finished at the same moment and Postgres aborted one of them
  ScoreConflict: { status: 409, code: "SCORE_CONFLICT", message: "The score could not be saved, please try again" },
} satisfies Record<string, ErrorDefinition>;

const teamSize: Record<Format, number> = {
  [Format.SINGLES]: 1,
  [Format.DOUBLES]: 2,
};

// Players can't leave a game that starts in less than 30 minutes
const LEAVE_DEADLINE_MS = 30 * 60 * 1000;

/**
 * Creates a game using the given game information and adds the given user to the game on team 1
 * @param game the game to be created
 * @param userId the user to be added to the game
 * @returns the created game
 * @throws AppError if the court does not exist
 */
export async function newGame(game: CreateGameInput, userId: string) {
  return await mapPrismaErrors(createGame({ ...game, status: GameStatus.OPEN }, userId), {
    P2003: commonErrors.CourtNotFound,
  });
}

/**
 * Adds the weather forecast at a game's court and start time. A completed or cancelled game is not
 * played anymore, so it gets no forecast and OpenWeather is not asked
 * @param game the game with its court
 * @returns the game with its forecast, which is null if the game is closed or the forecast cannot be loaded
 */
async function withForecast(game: GameDetails) {
  const isClosed =
    game.status === GameStatus.COMPLETED ||
    game.status === GameStatus.CANCELLED;

  return {
    ...game,
    forecast: isClosed
      ? null
      : await getForecast(
          game.court.latitude,
          game.court.longitude,
          game.startsAt,
        ),
  };
}

/**
 * Gets a game with the given game ID, with the weather forecast at its court and start time
 * @param gameId the game ID of the requested game
 * @returns the game with its court, players, rounds and forecast
 * @throws AppError if the game is not found
 */
export async function getGame(gameId: GameIdInput) {
  const game = await fetchGameDetails(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }
  return await withForecast(game);
}

/**
 * Sends a game's current state to every client watching it, after it changed: "gameUpdated" with the game,
 * or "gameDeleted" once it is gone. Does nothing if nobody is watching, and never throws
 * @param gameId the game that changed
 */
export function broadcastGameChange(gameId: string): void {
  gameStreams.refresh(gameId, async () => {
    const game = await fetchGameDetails(gameId);
    if (game === null) {
      return [{ event: "gameDeleted", data: { gameId } }];
    }
    return [{ event: "gameUpdated", data: { game: await withForecast(game) } }];
  });
}

/**
 * Tells the friends of a game's players that the game started or ended, so their friends lists show who is
 * playing. Does nothing if nobody has a friends list open, and never throws
 * @param gameId the game that started or ended
 * @param playerIds its players, for a game that is already deleted. Looked up when not given
 */
function announcePlayingChange(gameId: string, playerIds?: string[]): void {
  if (friendStreams.isEmpty()) {
    return;
  }

  const players = playerIds
    ? Promise.resolve(playerIds)
    : fetchGameDetails(gameId).then((game) => game?.players.map((player) => player.id) ?? []);
  players.then(refreshFriendsOfPlayers).catch((err: unknown) => {
    console.error(`Could not tell the friends of game ${gameId}'s players that it started or ended`, err);
  });
}

/**
 * Gets the scheduled games that players can join, with the weather forecast at their court and start time
 * @returns the feed's games, soonest first. A game's forecast is null if it cannot be loaded
 */
export async function getFeed() {
  const games = await fetchFeedGames(new Date());
  return await Promise.all(games.map(withForecast));
}

/**
 * Gets a user's upcoming and current games, with the weather forecast at their court and start time
 * @param userId the user whose games are requested
 * @returns the user's booked games, and open games that have not started, soonest first.
 * A game's forecast is null if it cannot be loaded
 */
export async function getUserGames(userId: string) {
  const games = await fetchUserGames(userId, new Date());
  return await Promise.all(games.map(withForecast));
}

/**
 * Gets a user's match history
 * @param userId the user whose match history is requested
 * @returns the user's completed games with their scores and rating changes, most recent first
 */
export async function getUserHistory(userId: string) {
  return await fetchUserHistory(userId);
}

/**
 * Cancels a game with the given game ID: a scheduled game is deleted, a matched game is marked cancelled.
 * Tournament games can't be cancelled, since the bracket depends on them, and neither can completed games,
 * since their players' ratings already include the result
 * @param gameId the game ID of the game to be cancelled
 * @param userId the user cancelling the game, who must be in it
 * @throws AppError if the game is not found, is a tournament game, is closed, or the user is not in it
 */
export async function cancelGame(gameId: GameIdInput, userId: string): Promise<void> {
  const game = await fetchGame(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  if (game.gameSource === GameSource.TOURNAMENT) {
    throw new AppError(gameErrors.TournamentNotCancellable);
  }

  if (!(await isUserInGame(userId, gameId))) {
    throw new AppError(gameErrors.NotInGame);
  }

  if (game.gameSource === GameSource.MATCHED) {
    const matchCancelled = await cancelMatchedGame(gameId);
    if (!matchCancelled) {
      throw new AppError(gameErrors.Closed);
    }
    broadcastGameChange(gameId);
    if (game.status === GameStatus.IN_PROGRESS) {
      announcePlayingChange(gameId);
    }
    await notifyMatchCancelled(gameId, userId);
    return;
  }

  // Its players are deleted with it, so the friends to tell are found first
  const playerIds =
    game.status === GameStatus.IN_PROGRESS
      ? ((await fetchGameDetails(gameId))?.players.map((player) => player.id) ?? [])
      : null;

  // A completed scheduled game is kept: its ratings were already applied
  if (!(await deleteGame(gameId))) {
    throw new AppError(gameErrors.Closed);
  }
  broadcastGameChange(gameId);
  if (playerIds !== null) {
    announcePlayingChange(gameId, playerIds);
  }
}

/**
 * Adds a given user to a team of an open scheduled game that has not started
 * @param gameId the game ID of the game to join
 * @param userId the user joining the game
 * @param team the team to join, 1 or 2
 * @throws AppError if the game is not found or not joinable, the team is full, or the user is already in it
 */
export async function joinGame(gameId: string, userId: string, team: number): Promise<void> {
  const game = await fetchGame(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  const now = new Date();
  // Matched games get their players from matchmaking, not the feed
  if (
    game.gameSource !== GameSource.SCHEDULED ||
    game.status !== GameStatus.OPEN ||
    game.startsAt <= now
  ) {
    throw new AppError(gameErrors.NotJoinable);
  }

  // The repository checks the game again once it holds the lock, in case it changed since
  const result = await mapPrismaErrors(
    addPlayerToTeam(gameId, userId, team, teamSize[game.format], now),
    { P2002: gameErrors.AlreadyInGame, P2003: gameErrors.GameOrUserNotFound },
  );
  if (result === "added") {
    broadcastGameChange(gameId);
    return;
  }
  throw new AppError(result === "teamFull" ? gameErrors.TeamFull : gameErrors.NotJoinable);
}

/**
 * Invites a friend to a scheduled game that can still be joined, by sending them a push notification.
 * The friend joins the game the usual way, so nothing is saved
 * @param gameId the game ID of the game to invite to
 * @param inviterId the user inviting, who must be in the game
 * @param friendId the friend being invited, who must not be in the game
 * @returns whether the friend's device was notified
 * @throws AppError if the game is not found or not joinable, the inviter is not in it, the friend already is,
 * or they are not friends
 */
export async function inviteFriend(
  gameId: string,
  inviterId: string,
  friendId: string,
) {
  const game = await fetchGameDetails(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  const inviter = game.players.find((player) => player.id === inviterId);
  if (inviter === undefined) {
    throw new AppError(gameErrors.NotInGame);
  }

  // Only games the friend could join from the feed: matched and tournament games pick their own players
  if (
    game.gameSource !== GameSource.SCHEDULED ||
    game.status !== GameStatus.OPEN ||
    game.startsAt <= new Date()
  ) {
    throw new AppError(gameErrors.NotJoinable);
  }

  if (game.players.some((player) => player.id === friendId)) {
    throw new AppError(gameErrors.AlreadyInGame);
  }

  const friendship = await fetchFriendship(inviterId, friendId);
  if (friendship?.status !== FriendshipStatus.ACCEPTED) {
    throw new AppError(gameErrors.NotFriends);
  }

  // Without Firebase credentials pushToUsers counts skipped tokens as reached, which would look like a delivered push
  if (!isPushEnabled()) {
    console.warn("FIREBASE_* not set, the game invite was not sent");
    return { notified: false };
  }

  const reached = await pushToUsers([friendId], {
    title: "Game invite",
    body: `${inviter.name} invited you to a ${game.format.toLowerCase()} game at ${game.court.name}.`,
    data: { gameId, type: "gameInvite" },
  });

  return { notified: reached > 0 };
}

/**
 * Removes a given user from a given game, unless it is a tournament or matched game, the game is closed or it starts
 * in less than 30 minutes
 * @param gameId the game ID of the game to leave
 * @param userId the user leaving the game
 * @throws AppError if the game is not found, can't be left, or the user is not in it
 */
export async function leaveGame(gameId: string, userId: string): Promise<void> {
  const game = await fetchGame(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  // Leaving would leave a team short in the bracket
  if (game.gameSource === GameSource.TOURNAMENT) {
    throw new AppError(gameErrors.TournamentNotLeavable);
  }

  // Matched games keep the players matchmaking picked
  if (game.gameSource === GameSource.MATCHED) {
    throw new AppError(gameErrors.MatchedNotLeavable);
  }

  if (
    game.status === GameStatus.COMPLETED ||
    game.status === GameStatus.CANCELLED
  ) {
    throw new AppError(gameErrors.Closed);
  }

  if (game.startsAt.getTime() - Date.now() < LEAVE_DEADLINE_MS) {
    throw new AppError(gameErrors.TooLate);
  }

  await mapPrismaErrors(deleteGameUser(gameId, userId), { P2025: gameErrors.PlayerNotFound });
  broadcastGameChange(gameId);
}

/**
 * Accepts a matched game for one of its players. The game is booked once every player has accepted
 * @param gameId the game ID of the matched game
 * @param userId the player accepting
 * @throws AppError if the game is not found, the user is not in it, or the match is not waiting for their answer
 */
export async function acceptMatch(gameId: string, userId: string): Promise<void> {
  const game = await fetchGame(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  if (!(await isUserInGame(userId, gameId))) {
    throw new AppError(gameErrors.NotInGame);
  }

  const result = await recordAcceptance(gameId, userId, new Date());
  if (result === "notPending") {
    throw new AppError(gameErrors.NotPending);
  }

  if (result === "alreadyAccepted") {
    throw new AppError(gameErrors.AlreadyAccepted);
  }

  broadcastGameChange(gameId);
  await notifyMatchAccepted(gameId, userId, result === "booked");
}

/**
 * Tells the other players of a matched game that a player accepted it, or that the game is booked
 * once every player has. A failed push is logged, since the acceptance is already saved
 * @param gameId the game ID of the matched game
 * @param userId the player who accepted
 * @param booked true if this was the last answer and the game is now booked
 */
async function notifyMatchAccepted(gameId: string, userId: string, booked: boolean) {
  try {
    const audience = await fetchMatchAudience(gameId, userId);
    if (!audience) {
      return;
    }

    const { actorName, otherIds, where } = audience;
    const messageTitle = booked ? "Match confirmed!" : "Match accepted";

    let messageBody: string;
    if (booked) {
      messageBody = `Everyone accepted. Your ${where} is booked.`;
    } else {
      messageBody = `${actorName} accepted your ${where}.`;
    }

    await pushToUsers(otherIds, {
      title: messageTitle,
      body: messageBody,
      data: { gameId },
    });
  } catch (err) {
    console.error(`Could not notify the players of game ${gameId} about an acceptance`, err);
  }
}

/**
 * Tells the other players of a matched game that a player cancelled it.
 * A failed push is logged, since the game is already cancelled
 * @param gameId the game ID of the matched game
 * @param userId the player who cancelled
 */
async function notifyMatchCancelled(gameId: string, userId: string) {
  try {
    const audience = await fetchMatchAudience(gameId, userId);
    if (!audience) {
      return;
    }

    await pushToUsers(audience.otherIds, {
      title: "Match cancelled",
      body: `${audience.actorName} cancelled your ${audience.where}.`,
      data: { gameId },
    });
  } catch (err) {
    console.error(`Could not notify the players of game ${gameId} about a cancellation`, err);
  }
}

/**
 * Looks up who to tell about a player's answer to a matched game
 * @param gameId the game ID of the matched game
 * @param userId the player who answered
 * @returns the player's name, the other players' IDs and e.g. "singles game at <court>",
 * or null if the game or the player is gone
 */
async function fetchMatchAudience(gameId: string, userId: string) {
  const game = await fetchGameDetails(gameId);
  const actor = game?.players.find((player) => player.id === userId);
  if (!game || !actor) {
    return null;
  }

  return {
    actorName: actor.name,
    otherIds: game.players.map((player) => player.id).filter((id) => id !== userId),
    where: `${game.format.toLowerCase()} game at ${game.court.name}`,
  };
}

/**
 * Checks that a game exists, that the given user is in it, and that it is not completed or cancelled
 * @param gameId the game ID of the game to edit
 * @param userId the user editing the game
 * @param isMove true when changing the time or court, which matched games don't allow
 * @throws AppError with the reason the user cannot edit the game
 */
async function checkCanEditGame(
  gameId: string,
  userId: string,
  isMove = false,
): Promise<void> {
  const game = await fetchGame(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  if (!(await isUserInGame(userId, gameId))) throw new AppError(gameErrors.NotInGame);

  if (
    game.status === GameStatus.COMPLETED ||
    game.status === GameStatus.CANCELLED
  ) {
    throw new AppError(gameErrors.Closed);
  }

  // Matched players accepted this time and court
  if (isMove && game.gameSource === GameSource.MATCHED) {
    throw new AppError(gameErrors.MatchedNotMovable);
  }

  // A game being played can't move: a new start time would leave it in progress but starting later
  if (isMove && game.status === GameStatus.IN_PROGRESS) {
    throw new AppError(gameErrors.AlreadyStarted);
  }
}

/**
 * Moves a game to a new start time
 * @param gameId the game ID of the game to change
 * @param userId the user changing the game, who must be in it
 * @param startsAt the new start time
 * @returns the updated game
 * @throws AppError with the reason the game cannot be changed
 */
export async function changeGameTime(
  gameId: string,
  userId: string,
  startsAt: Date,
) {
  await checkCanEditGame(gameId, userId, true);
  const game = await mapPrismaErrors(updateGame(gameId, { startsAt }), { P2025: gameErrors.NotFound });
  broadcastGameChange(gameId);
  return game;
}

/**
 * Decides whether a game can start: it must be booked, so its players are known and every one of them
 * has accepted it, and not started yet
 * @param game the game to start
 * @returns the reason the game cannot start, or null if it can
 */
function whyGameCannotStart(game: Game): ErrorDefinition | null {
  if (
    game.status === GameStatus.COMPLETED ||
    game.status === GameStatus.CANCELLED
  ) {
    return gameErrors.Closed;
  }

  if (game.status === GameStatus.IN_PROGRESS) {
    return gameErrors.AlreadyStarted;
  }

  // An open game still has free spots, or is a match waiting for answers
  if (game.status !== GameStatus.BOOKED) {
    return gameErrors.NotBooked;
  }

  return null;
}

/**
 * Starts a booked game when a player taps Start: it is in progress from now on, and its start time becomes now.
 * Games never start on their own, so this works early or late. Scheduled, matched and tournament games can all
 * start, since a booked game's players are known and have accepted it. A tournament's later rounds are timed from
 * the tournament's start, so they don't move
 * @param gameId the game ID of the game to start
 * @param userId the user starting the game, who must be in it
 * @returns the started game
 * @throws AppError with the reason the game cannot start
 */
export async function startGame(gameId: string, userId: string) {
  const game = await fetchGame(gameId);
  if (game === null) {
    throw new AppError(gameErrors.NotFound);
  }

  if (!(await isUserInGame(userId, gameId))) {
    throw new AppError(gameErrors.NotInGame);
  }

  const error = whyGameCannotStart(game);
  if (error) {
    throw new AppError(error);
  }

  const started = await startBookedGame(gameId, new Date());
  if (started === null) {
    // Another player started it, or it was completed, cancelled or deleted, after the check above
    const current = await fetchGame(gameId);
    const reason =
      current === null
        ? gameErrors.NotFound
        : (whyGameCannotStart(current) ?? gameErrors.AlreadyStarted);
    throw new AppError(reason);
  }

  broadcastGameChange(gameId);
  announcePlayingChange(gameId);
  return started;
}

/**
 * Moves a game to a different court
 * @param gameId the game ID of the game to change
 * @param userId the user changing the game, who must be in it
 * @param courtId the ID of the new court
 * @returns the updated game
 * @throws AppError with the reason the game cannot be changed
 */
export async function changeGameLocation(
  gameId: string,
  userId: string,
  courtId: number,
) {
  await checkCanEditGame(gameId, userId, true);
  const game = await mapPrismaErrors(updateGame(gameId, { courtId }), {
    P2003: commonErrors.CourtNotFound,
    P2025: gameErrors.NotFound,
  });
  broadcastGameChange(gameId);
  return game;
}

/**
 * Reports the final score of a game: saves its rounds, marks it as completed and updates every player's rating
 * @param gameId the game ID of the game the score is for
 * @param userId the user reporting the score, who must be in the game
 * @param rounds the [team 1 score, team 2 score] of each round, in order
 * @returns the completed game, its rounds and each player's rating change
 * @throws AppError with the reason the score cannot be reported
 */
export async function reportScore(
  gameId: string,
  userId: string,
  rounds: ReportScoreInput["rounds"],
) {
  await checkCanEditGame(gameId, userId);

  let completed;
  try {
    completed = await mapPrismaErrors(completeGame(gameId, rounds), { P2034: gameErrors.ScoreConflict });
  } catch (e) {
    if (e instanceof IncompleteTeamsError) {
      throw new AppError(gameErrors.IncompleteTeams);
    }
    throw e;
  }
  if (completed === null) {
    // Another report completed the game after the check above
    throw new AppError(gameErrors.Closed);
  }

  broadcastGameChange(gameId);
  // A game scored without being started was never in progress, and the friends lists show no change
  announcePlayingChange(gameId);
  return completed;
}
