// Live updates: turns the changes the services announce (events/changes.ts) into pushes to the clients watching,
// over the Server-Sent Events streams. Every step does nothing when nobody is watching what it would update.
import { type GameChange, onGameChanged, onTournamentChanged, type TournamentChange, tournamentChanged } from "../events/changes";
import type { StreamEvent } from "../events/eventStreams";
import { friendStreams } from "../friends/friends.events";
import { PLAYING_WINDOW_MS, refreshFriendsOfPlayers } from "../friends/friends.service";
import { GameSource, GameStatus } from "../generated/prisma/enums";
import { gameListStreams, gameStreams } from "../games/games.events";
import { fetchGameDetails } from "../games/games.repository";
import { getFeed, getUserGames, withForecast } from "../games/games.service";
import { tournamentStreams } from "../tournaments/tournaments.events";
import { fetchTournamentDetails } from "../tournaments/tournaments.repository";
import { getTournament, getTournamentFeed, getUserTournaments } from "../tournaments/tournaments.service";

let registered = false;

/**
 * Starts pushing announced changes to the clients watching. Safe to call more than once
 */
export function registerLiveUpdates(): void {
  if (registered) {
    return;
  }
  registered = true;

  onGameChanged((change) => {
    pushGameChange(change).catch((err: unknown) => {
      console.error(`Could not push the change of game ${change.gameId}`, err);
    });
  });
  onTournamentChanged((change) => {
    pushTournamentChange(change).catch((err: unknown) => {
      console.error(`Could not push the change of tournament ${change.tournamentId}`, err);
    });
  });
}

/**
 * The Games tab's current state for a user: "feed" (the same for everyone) and "mine"
 * @param userId the user whose Games tab it is
 * @returns the two events, shaped like GET /games/feed + GET /tournaments/feed and GET /games/me + /tournaments/me
 */
export async function getGameListEvents(userId: string): Promise<StreamEvent[]> {
  return await Promise.all([loadFeedEvent(), loadMineEvent(userId)]);
}

/**
 * When a game starts, its players show as playing to their friends for PLAYING_WINDOW_MS. Nothing changes in
 * the database when that runs out, so this pushes the friends pages again then, unless nobody has one open or
 * the game already ended (which pushed them already). The timer doesn't keep the process alive; one lost to a
 * restart only leaves a page stale until it reconnects, which loads it again
 * @param gameId the game that started
 * @param startedAt when it started
 */
function schedulePlayingEnd(gameId: string, startedAt: Date): void {
  const endsIn = startedAt.getTime() + PLAYING_WINDOW_MS - Date.now();
  const timer = setTimeout(() => {
    pushPlayingEnd(gameId).catch((err: unknown) => {
      console.error(`Could not push the end of game ${gameId}'s playing window`, err);
    });
  }, Math.max(endsIn, 0));
  timer.unref();
}

// The window of a game ran out: if it is still in progress, its players no longer show as playing
async function pushPlayingEnd(gameId: string): Promise<void> {
  if (friendStreams.isEmpty()) {
    return;
  }
  const game = await fetchGameDetails(gameId);
  if (game?.status === GameStatus.IN_PROGRESS) {
    await refreshFriendsOfPlayers(game.players.map((player) => player.id));
  }
}

// A game changed: its own screen, its players' friends, its tournament, and the Games tab lists it is on
async function pushGameChange({ gameId, playerIds, onFeed, startedAt }: GameChange): Promise<void> {
  if (startedAt) {
    schedulePlayingEnd(gameId, startedAt);
  }

  gameStreams.refresh(gameId, async () => {
    const game = await fetchGameDetails(gameId);
    if (game === null) {
      return [{ event: "gameDeleted", data: { gameId } }];
    }
    return [{ event: "gameUpdated", data: { game: await withForecast(game) } }];
  });

  const othersWatching = !friendStreams.isEmpty() || !gameListStreams.isEmpty() || !tournamentStreams.isEmpty();
  if (!othersWatching) {
    return;
  }

  // A deleted game's players are given, since they can't be looked up any more
  const game = playerIds === undefined ? await fetchGameDetails(gameId) : null;
  const players = playerIds ?? game?.players.map((player) => player.id) ?? [];

  // A friend starts or stops playing when one of their games starts, ends or is cancelled
  await refreshFriendsOfPlayers(players);

  if (game?.tournament) {
    // Updates the bracket, and the lists of everyone in the tournament (a reported score can book the next round)
    tournamentChanged({ tournamentId: game.tournament.id });
    return;
  }

  if (onFeed ?? game?.gameSource === GameSource.SCHEDULED) {
    refreshFeed();
  }
  refreshMine(players);
}

// A tournament changed: its screen, the feed (it may open, fill or close), and its players' lists
async function pushTournamentChange({ tournamentId, playerIds = [] }: TournamentChange): Promise<void> {
  tournamentStreams.refresh(tournamentId, async () => [
    { event: "tournamentUpdated", data: { tournament: await getTournament(tournamentId) } },
  ]);

  if (gameListStreams.isEmpty()) {
    return;
  }

  refreshFeed();
  const tournament = await fetchTournamentDetails(tournamentId);
  refreshMine([...(tournament?.players.map((player) => player.id) ?? []), ...playerIds]);
}

// Loaded once and sent to everyone with the Games tab open
function refreshFeed(): void {
  gameListStreams.refreshEveryone(async () => [await loadFeedEvent()]);
}

// Only users with the Games tab open are loaded
function refreshMine(userIds: Iterable<string>): void {
  for (const userId of new Set(userIds)) {
    gameListStreams.refresh(userId, async () => [await loadMineEvent(userId)]);
  }
}

async function loadFeedEvent(): Promise<StreamEvent> {
  const [games, tournaments] = await Promise.all([getFeed(), getTournamentFeed()]);
  return { event: "feed", data: { games, tournaments } };
}

async function loadMineEvent(userId: string): Promise<StreamEvent> {
  const [games, tournaments] = await Promise.all([getUserGames(userId), getUserTournaments(userId)]);
  return { event: "mine", data: { games, tournaments } };
}
