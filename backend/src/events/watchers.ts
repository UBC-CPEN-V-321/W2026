// Who is watching: lets the services skip work that only open pages need, without knowing which pages exist
import { friendStreams } from "../friends/friends.events";
import { gameListStreams } from "../games/games.events";
import { tournamentStreams } from "../tournaments/tournaments.events";

/**
 * @returns whether anyone has a page open that shows games' players: a friends page, the Games tab or a
 * tournament. Their players have to be looked up to update those pages
 */
export function anyoneWatchingPlayers(): boolean {
  return !friendStreams.isEmpty() || !gameListStreams.isEmpty() || !tournamentStreams.isEmpty();
}
