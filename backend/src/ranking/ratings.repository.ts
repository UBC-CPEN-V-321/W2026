// Queries for player ratings: users.rating and the match summary in game_users.
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import { RatingChange } from "./ranking.types";
import { RatedGame } from "./stats";

// The user fields shown on the leaderboard
const leaderboardUserSelect = {
  id: true,
  username: true,
  name: true,
  rating: true,
} satisfies Prisma.UserSelect;

export type LeaderboardUser = Prisma.UserGetPayload<{
  select: typeof leaderboardUserSelect;
}>;

// Highest rating first; the full decimal rating breaks ties the rounded rating can't,
// and username breaks exact ties (e.g. new players at 1500) so the order is stable
const leaderboardOrder = [
  { rating: "desc" },
  { username: "asc" },
] satisfies Prisma.UserOrderByWithRelationInput[];

export interface GamePlayerRating {
  userId: string;
  team: number;
  rating: number;
  gamesPlayed: number;
}

/**
 * Fetches every player in a game with their current rating and how many rated games they
 * have played, locking their user rows until the transaction ends so two games finishing at
 * once can't overwrite each other's rating
 * @param tx the transaction the final score is being saved in
 * @param gameId the game ID of the finished game
 * @returns each player's user ID, team, rating and rated games played before this one, ordered by user ID
 */
export async function fetchGamePlayerRatingsForUpdate(
  tx: Prisma.TransactionClient,
  gameId: string,
): Promise<GamePlayerRating[]> {
  // Prisma has no SELECT ... FOR UPDATE; ordering by id keeps the lock order consistent to avoid deadlocks
  const players = await tx.$queryRaw<Omit<GamePlayerRating, "gamesPlayed">[]>`
    SELECT u."id" AS "userId", gu."team", u."rating"
    FROM "game_users" gu
    JOIN "users" u ON u."id" = gu."userId"
    WHERE gu."gameId" = ${gameId}::uuid
    ORDER BY u."id"
    FOR UPDATE OF u
  `;

  // Counted after the lock, in a new statement, so a game another transaction rated while we
  // waited for the lock is included. A game is rated once its players' ratingAfter is set.
  const counts = await tx.gameUser.groupBy({
    by: ["userId"],
    where: {
      userId: { in: players.map((player) => player.userId) },
      gameId: { not: gameId },
      ratingAfter: { not: null },
    },
    _count: { _all: true },
  });
  const gamesPlayed = new Map(
    counts.map((count) => [count.userId, count._count._all]),
  );

  return players.map((player) => ({
    ...player,
    gamesPlayed: gamesPlayed.get(player.userId) ?? 0,
  }));
}

/**
 * Saves each player's new rating and records the before and after in the game's match summary
 * @param tx the transaction the final score is being saved in
 * @param gameId the game ID of the finished game
 * @param changes the rating change of each player in the game
 * @throws If a user or game player row can't be updated; the caller's transaction rolls back
 */
export async function saveRatingChanges(
  tx: Prisma.TransactionClient,
  gameId: string,
  changes: RatingChange[],
): Promise<void> {
  // The user being saved, so the error can say which one failed
  let userId: string | undefined;
  try {
    for (const change of changes) {
      userId = change.userId;
      await tx.user.update({
        where: { id: userId },
        data: { rating: change.ratingAfter },
      });
      await tx.gameUser.update({
        where: { gameId_userId: { gameId, userId } },
        data: {
          ratingBefore: change.ratingBefore,
          ratingAfter: change.ratingAfter,
        },
      });
    }
  } catch (e) {
    // Rethrow so the final-score transaction still rolls back
    throw new Error(
      `Failed to save rating change for user ${userId} in game ${gameId}`,
      { cause: e },
    );
  }
}

/**
 * Fetches the top of the leaderboard
 * @param limit how many players to return
 * @returns the players with the highest ratings, in leaderboard order
 */
export async function fetchLeaderboard(
  limit: number,
): Promise<LeaderboardUser[]> {
  return await prisma.user.findMany({
    select: leaderboardUserSelect,
    orderBy: leaderboardOrder,
    take: limit,
  });
}

/**
 * Fetches a user with their position on the leaderboard
 * @param userId the user to look up
 * @returns the user and their 1-based rank, or null if the user does not exist
 */
export async function fetchLeaderboardUser(
  userId: string,
): Promise<{ user: LeaderboardUser; rank: number } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: leaderboardUserSelect,
  });
  if (user === null) {
    return null;
  }

  // Everyone ahead of the user in leaderboardOrder
  const ahead = await prisma.user.count({
    where: {
      OR: [
        { rating: { gt: user.rating } },
        { rating: user.rating, username: { lt: user.username } },
      ],
    },
  });

  return { user, rank: ahead + 1 };
}

/**
 * Fetches every game a user has been rated in, from their side
 * @param userId the user whose games are fetched
 * @returns the user's rated games, oldest first, with their team, rating before and after,
 *          the rounds and each opponent's rating before the game
 */
export async function fetchRatedGames(userId: string): Promise<RatedGame[]> {
  const rows = await prisma.gameUser.findMany({
    where: { userId, ratingBefore: { not: null }, ratingAfter: { not: null } },
    select: {
      team: true,
      ratingBefore: true,
      ratingAfter: true,
      game: {
        select: {
          id: true,
          startsAt: true,
          rounds: {
            select: { team1Score: true, team2Score: true },
            orderBy: { number: "asc" },
          },
          players: { select: { team: true, ratingBefore: true } },
        },
      },
    },
    orderBy: [{ game: { startsAt: "asc" } }, { gameId: "asc" }],
  });

  // The query already skips unrated rows; checking again narrows the ratings' type
  return rows.flatMap(({ team, ratingBefore, ratingAfter, game }) =>
    ratingBefore === null || ratingAfter === null
      ? []
      : [
          {
            gameId: game.id,
            playedAt: game.startsAt,
            team,
            ratingBefore,
            ratingAfter,
            rounds: game.rounds.map(
              ({ team1Score, team2Score }): [number, number] => [team1Score, team2Score],
            ),
            opponentRatings: game.players
              .filter((player) => player.team !== team)
              .flatMap((player) => (player.ratingBefore === null ? [] : [player.ratingBefore])),
          },
        ],
  );
}
