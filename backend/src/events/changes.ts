// What changed, announced by the services and acted on by live/live.ts, which pushes it to the clients watching.
// Services only announce; they never import the live updates, so neither depends on the other.
import { EventEmitter } from "node:events";

/**
 * A game was created, changed or deleted
 * @property gameId the game
 * @property playerIds its players, given when the game is already gone (deleted) so they can't be looked up
 * @property onFeed whether the game was on the feed, given with playerIds for a deleted game
 * @property startedAt when the game was started, given when this change is a player starting it
 */
export interface GameChange {
  gameId: string;
  playerIds?: string[] | undefined;
  onFeed?: boolean | undefined;
  startedAt?: Date | undefined;
}

/**
 * A tournament was created, changed, drawn or cancelled
 * @property tournamentId the tournament
 * @property playerIds players whose lists changed besides the tournament's current players, e.g. one who left
 */
export interface TournamentChange {
  tournamentId: string;
  playerIds?: string[] | undefined;
}

const emitter = new EventEmitter();

/**
 * Announces that a game changed. Never throws: listeners handle their own errors
 */
export function gameChanged(change: GameChange): void {
  emitter.emit("game", change);
}

/**
 * Announces that a tournament changed. Never throws: listeners handle their own errors
 */
export function tournamentChanged(change: TournamentChange): void {
  emitter.emit("tournament", change);
}

/**
 * @param listener called with every game change
 */
export function onGameChanged(listener: (change: GameChange) => void): void {
  emitter.on("game", listener);
}

/**
 * @param listener called with every tournament change
 */
export function onTournamentChanged(listener: (change: TournamentChange) => void): void {
  emitter.on("tournament", listener);
}
