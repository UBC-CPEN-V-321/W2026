import { tournamentChanged } from "../../src/events/changes";
import { Format } from "../../src/generated/prisma/enums";
import {
  createTournament,
  markTournamentCancelled,
  registerPlayer,
  unregisterPlayer,
} from "../../src/tournaments/tournaments.repository";
import {
  cancelTournament,
  joinTournament,
  leaveTournament,
  newTournament,
} from "../../src/tournaments/tournaments.service";

jest.mock("../../src/events/changes", () => ({
  tournamentChanged: jest.fn(),
}));

jest.mock("../../src/tournaments/tournaments.repository", () => ({
  createTournament: jest.fn(),
  registerPlayer: jest.fn(),
  unregisterPlayer: jest.fn(),
  markTournamentCancelled: jest.fn(),
}));

const mockedTournamentChanged = jest.mocked(tournamentChanged);
const tournamentId = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const userId = "0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e";

// Each change a tournament goes through is announced, so its screen and the Games tab update live
describe("Mocked: tournament changes are announced", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Input: a new tournament
  // Expected behavior: it is announced, since it is now on the feed and in its creator's tournaments
  // Expected output: tournamentChanged with its ID
  test("announces a new tournament", async () => {
    jest.mocked(createTournament).mockResolvedValue({ id: tournamentId } as Awaited<ReturnType<typeof createTournament>>);

    await newTournament(
      { name: "Fall Cup", format: Format.SINGLES, startsAt: new Date(Date.now() + 86_400_000), courtId: 1 },
      userId,
    );

    expect(mockedTournamentChanged).toHaveBeenCalledWith({ tournamentId });
  });

  // Input: a player registers, once without filling it and once filling it (which draws the bracket)
  // Expected behavior: both are announced
  // Expected output: tournamentChanged twice with its ID
  test.each(["registered", "drawn"] as const)("announces a registration that is %s", async (result) => {
    jest.mocked(registerPlayer).mockResolvedValue(result);

    await joinTournament(tournamentId, userId);

    expect(mockedTournamentChanged).toHaveBeenCalledWith({ tournamentId });
  });

  // Input: a player leaves
  // Expected behavior: announced with the player named, since they are no longer one of its players
  // Expected output: tournamentChanged with the tournament and the player
  test("announces a player leaving, naming them", async () => {
    jest.mocked(unregisterPlayer).mockResolvedValue("left");

    await leaveTournament(tournamentId, userId);

    expect(mockedTournamentChanged).toHaveBeenCalledWith({ tournamentId, playerIds: [userId] });
  });

  // Input: the creator cancels it
  // Expected behavior: announced
  // Expected output: tournamentChanged with its ID
  test("announces a cancelled tournament", async () => {
    jest.mocked(markTournamentCancelled).mockResolvedValue("cancelled");

    await cancelTournament(tournamentId, userId);

    expect(mockedTournamentChanged).toHaveBeenCalledWith({ tournamentId });
  });

  // Input: a join, leave and cancel that the repository refuses
  // Expected behavior: nothing changed, so nothing is announced
  // Expected output: each call rejects, tournamentChanged never called
  test("announces nothing when nothing changed", async () => {
    jest.mocked(registerPlayer).mockResolvedValue("full");
    jest.mocked(unregisterPlayer).mockResolvedValue("notRegistered");
    jest.mocked(markTournamentCancelled).mockResolvedValue("notCreator");

    await expect(joinTournament(tournamentId, userId)).rejects.toThrow();
    await expect(leaveTournament(tournamentId, userId)).rejects.toThrow();
    await expect(cancelTournament(tournamentId, userId)).rejects.toThrow();

    expect(mockedTournamentChanged).not.toHaveBeenCalled();
  });
});
