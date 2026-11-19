import { EventStreams } from "../events/eventStreams";

// Clients watching a game, by game ID: "gameUpdated" with the game each time it changes, "gameDeleted" once it is gone
export const gameStreams = new EventStreams();
