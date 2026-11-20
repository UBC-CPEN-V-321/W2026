import { EventStreams } from "../events/eventStreams";

// Searching players watching the queue, by user ID: "nearby" with the other players searching near them each time the
// queue changes, or "notQueued" once they are no longer in it (they left, or a match took them out)
export const queueStreams = new EventStreams();
