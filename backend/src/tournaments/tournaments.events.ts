import { EventStreams } from "../events/eventStreams";

// Clients watching a tournament, by tournament ID: "tournamentUpdated" with the tournament each time it changes
export const tournamentStreams = new EventStreams();
