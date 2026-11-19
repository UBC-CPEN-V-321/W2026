import { EventStreams } from "../events/eventStreams";

// Clients watching their own friends page, by user ID: "friends" with the friends list (and the game each friend is
// playing) and "requests" with the pending requests, each time either changes
export const friendStreams = new EventStreams();
