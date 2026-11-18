import { AppError, commonErrors, type ErrorDefinition, mapPrismaErrors } from "../errors";
import { getForecast } from "../external/weather";
import {
  type CancelResult,
  createTournament,
  fetchFeedTournaments,
  fetchTournamentDetails,
  fetchUserTournaments,
  markTournamentCancelled,
  type RegisterResult,
  registerPlayer,
  type UnregisterResult,
  unregisterPlayer,
} from "./tournaments.repository";
import type { CreateTournamentInput } from "./tournaments.schemas";

export const tournamentErrors = {
  NotFound: { status: 404, code: "TOURNAMENT_NOT_FOUND", message: "Tournament not found" },
  NotOpen: { status: 409, code: "TOURNAMENT_NOT_OPEN", message: "Tournament is not open for registration" },
  Full: { status: 409, code: "TOURNAMENT_FULL", message: "Tournament is full" },
  AlreadyRegistered: { status: 409, code: "ALREADY_REGISTERED", message: "User already registered" },
  NotRegistered: { status: 404, code: "NOT_REGISTERED", message: "User not registered" },
  CreatorCannotLeave: {
    status: 409,
    code: "CREATOR_CANNOT_LEAVE",
    message: "The creator cannot leave the tournament, cancel it instead",
  },
  NotCreator: { status: 403, code: "NOT_CREATOR", message: "Only the creator can cancel the tournament" },
} satisfies Record<string, ErrorDefinition>;

/**
 * @param result why the repository did not register the user
 * @returns the matching join error
 */
function toJoinError(
  result: Exclude<RegisterResult, "registered" | "drawn">,
): ErrorDefinition {
  switch (result) {
    case "notFound":
      return tournamentErrors.NotFound;
    case "notOpen":
      return tournamentErrors.NotOpen;
    case "full":
      return tournamentErrors.Full;
    case "alreadyRegistered":
      return tournamentErrors.AlreadyRegistered;
  }
}

/**
 * @param result why the repository did not remove the user
 * @returns the matching leave error
 */
function toLeaveError(
  result: Exclude<UnregisterResult, "left">,
): ErrorDefinition {
  switch (result) {
    case "notFound":
      return tournamentErrors.NotFound;
    case "notOpen":
      return tournamentErrors.NotOpen;
    case "creator":
      return tournamentErrors.CreatorCannotLeave;
    case "notRegistered":
      return tournamentErrors.NotRegistered;
  }
}

/**
 * @param result why the repository did not cancel the tournament
 * @returns the matching cancel error
 */
function toCancelError(
  result: Exclude<CancelResult, "cancelled">,
): ErrorDefinition {
  switch (result) {
    case "notFound":
      return tournamentErrors.NotFound;
    case "notCreator":
      return tournamentErrors.NotCreator;
    case "notOpen":
      return tournamentErrors.NotOpen;
  }
}

/**
 * Creates a tournament and registers its creator as its first player
 * @param tournament the tournament to be created
 * @param userId the user creating the tournament
 * @returns the created tournament
 * @throws AppError if the court is not found
 */
export async function newTournament(
  tournament: CreateTournamentInput,
  userId: string,
) {
  return await mapPrismaErrors(createTournament(tournament, userId), { P2003: commonErrors.CourtNotFound });
}

/**
 * Gets the tournaments that players can register for, with the weather forecast at their court and start time
 * @returns the feed's tournaments, soonest first. A tournament's forecast is null if it cannot be loaded
 */
export async function getTournamentFeed() {
  const tournaments = await fetchFeedTournaments(new Date());

  return await Promise.all(
    tournaments.map(async (tournament) => ({
      ...tournament,
      forecast: await getForecast(
        tournament.court.latitude,
        tournament.court.longitude,
        tournament.startsAt,
      ),
    })),
  );
}

/**
 * Gets the tournaments a user is registered for that are open, in progress or recently completed
 * @param userId the user whose tournaments are requested
 * @returns the user's tournaments, soonest first
 */
export async function getUserTournaments(userId: string) {
  return await fetchUserTournaments(userId, new Date());
}

/**
 * Gets a tournament with its players and bracket
 * @param tournamentId the ID of the requested tournament
 * @returns the tournament details
 * @throws AppError if the tournament is not found
 */
export async function getTournament(tournamentId: string) {
  const tournament = await fetchTournamentDetails(tournamentId);
  if (tournament === null) {
    throw new AppError(tournamentErrors.NotFound);
  }
  return tournament;
}

/**
 * Registers a user for a tournament. The registration that fills the tournament draws its bracket
 * and books the quarterfinals
 * @param tournamentId the ID of the tournament to join
 * @param userId the user registering
 * @throws AppError with the reason the user cannot register, or if the user is not found
 */
export async function joinTournament(tournamentId: string, userId: string): Promise<void> {
  const result = await mapPrismaErrors(registerPlayer(tournamentId, userId, new Date()), {
    P2003: commonErrors.UserNotFound,
  });
  if (result !== "registered" && result !== "drawn") {
    throw new AppError(toJoinError(result));
  }
}

/**
 * Removes a user from a tournament that is still open for registration
 * @param tournamentId the ID of the tournament to leave
 * @param userId the user leaving
 * @throws AppError with the reason the user cannot leave
 */
export async function leaveTournament(tournamentId: string, userId: string): Promise<void> {
  const result = await unregisterPlayer(tournamentId, userId);
  if (result !== "left") {
    throw new AppError(toLeaveError(result));
  }
}

/**
 * Cancels a tournament that is still open for registration; only its creator can
 * @param tournamentId the ID of the tournament to cancel
 * @param userId the user cancelling the tournament
 * @throws AppError with the reason the user cannot cancel it
 */
export async function cancelTournament(tournamentId: string, userId: string): Promise<void> {
  const result = await markTournamentCancelled(tournamentId, userId);
  if (result !== "cancelled") {
    throw new AppError(toCancelError(result));
  }
}
