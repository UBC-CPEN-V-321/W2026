import { EventStreams } from "../events/eventStreams";

// Clients watching a game, by game ID: "gameUpdated" with the game each time it changes, "gameDeleted" once it is gone
export const gameStreams = new EventStreams();

// Clients watching the Games tab, by user ID: "feed" with the games and tournaments open to join (the same for
// everyone), and "mine" with the user's own games and tournaments, each time they change
export const gameListStreams = new EventStreams();
