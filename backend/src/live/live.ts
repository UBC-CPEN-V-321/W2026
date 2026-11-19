// Live updates: turns the changes the services announce (events/changes.ts) into pushes to the clients watching,
// over the Server-Sent Events streams. Every step does nothing when nobody is watching what it would update.
import { logFailure } from "../errors";
import { type GameChange, onGameChanged, onTournamentChanged, type TournamentChange, tournamentChanged } from "../events/changes";
import type { StreamEvent } from "../events/eventStreams";
import { anyoneWatchingPlayers } from "../events/watchers";
import { refreshFriendsOfPlayers, refreshFriendsWhenPlayingEnds } from "../friends/friends.service";
import { GameSource } from "../generated/prisma/enums";
import { gameListStreams, gameStreams } from "../games/games.events";
import { fetchGameDetails, type GameDetails } from "../games/games.repository";
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
    logFailure(pushGameChange(change), `push the change of game ${change.gameId}`);
  });
  onTournamentChanged((change) => {
    logFailure(pushTournamentChange(change), `push the change of tournament ${change.tournamentId}`);
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

// A game changed: its own screen, its players' friends, its tournament, and the Games tab lists it is on
async function pushGameChange(change: GameChange): Promise<void> {
  if (change.startedAt) {
    refreshFriendsWhenPlayingEnds(change.gameId, change.startedAt);
  }
  refreshGameScreen(change.gameId);

  if (!anyoneWatchingPlayers()) {
    return;
  }
  const { game, players } = await playersOf(change);

  // A friend starts or stops playing when one of their games starts, ends or is cancelled
  await refreshFriendsOfPlayers(players);

  if (game?.tournament) {
    // Updates the bracket, and the lists of everyone in the tournament (a reported score can book the next round)
    tournamentChanged({ tournamentId: game.tournament.id });
    return;
  }

  if (change.onFeed ?? game?.gameSource === GameSource.SCHEDULED) {
    refreshFeed();
  }
  refreshMine(players);
}

// The game's own screen: the game as it is now, or that it was deleted
function refreshGameScreen(gameId: string): void {
  gameStreams.refresh(gameId, async () => {
    const game = await fetchGameDetails(gameId);
    if (game === null) {
      return [{ event: "gameDeleted", data: { gameId } }];
    }
    return [{ event: "gameUpdated", data: { game: await withForecast(game) } }];
  });
}

// The changed game and its players. A deleted game's players are given, since they can't be looked up any more
async function playersOf(change: GameChange): Promise<{ game: GameDetails | null; players: string[] }> {
  if (change.playerIds !== undefined) {
    return { game: null, players: change.playerIds };
  }
  const game = await fetchGameDetails(change.gameId);
  return { game, players: game?.players.map((player) => player.id) ?? [] };
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
