import { executeWrite, selectRows } from '../../core/db/mysql';
import { type PlayedGame, type RatingScores, reputationScore } from '../reputation';

// a player the user can rate, and whether they already did
export interface PlayerToRate {
  userId: number;
  firstName: string;
  lastName: string;
  rated: boolean;
}

interface PlayerToRateRow {
  user_id: number;
  first_name: string;
  last_name: string;
  rated: number;
}

interface AttendanceRow {
  user_id: number;
  no_show: number;
}

async function readAttendance(gameId: number, userIds: number[]): Promise<AttendanceRow[]> {
  return selectRows<AttendanceRow>(
    `SELECT user_id, no_show FROM game_attendance
     WHERE game_id = ? AND user_id IN (${userIds.map(() => '?').join(', ')})`,
    [gameId, ...userIds],
  );
}

function showedUp(rows: AttendanceRow[], userId: number): boolean {
  return rows.some((row) => row.user_id === userId && Number(row.no_show) === 0);
}

/*  the other players who showed up to the completed game, or null if the user can't rate
    in it: the game isn't completed yet, they weren't in it, or they were a no-show.
    Says who the user already rated, but never what anyone was rated
 */
export async function getPlayersToRate(gameId: number, userId: number): Promise<PlayerToRate[] | null> {
  if (!showedUp(await readAttendance(gameId, [userId]), userId)) return null;

  const rows = await selectRows<PlayerToRateRow>(
    `SELECT u.user_id, u.first_name, u.last_name, r.rater_id IS NOT NULL AS rated
     FROM game_attendance a
     JOIN users u ON u.user_id = a.user_id
     LEFT JOIN player_ratings r
       ON r.game_id = a.game_id AND r.rated_id = a.user_id AND r.rater_id = ?
     WHERE a.game_id = ? AND a.no_show = FALSE AND a.user_id <> ?
     ORDER BY u.first_name, u.last_name, u.user_id`,
    [userId, gameId, userId],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    rated: Number(row.rated) === 1,
  }));
}

/*  why the user can't give this rating: they can't rate in this game, it's their own
    rating, the other player was a no-show or wasn't in the game, or they already rated them
 */
export type CreateRatingProblem = 'not_allowed' | 'self' | 'player_not_found' | 'already_rated';

export type CreateRatingResult = { ok: true } | { ok: false; problem: CreateRatingProblem };

// records the user's rating of a player, a rating can't be changed once it's given
export async function createRating(
  gameId: number,
  raterId: number,
  ratedId: number,
  scores: RatingScores,
): Promise<CreateRatingResult> {
  const attendance = await readAttendance(gameId, [raterId, ratedId]);
  if (!showedUp(attendance, raterId)) return { ok: false, problem: 'not_allowed' };
  if (raterId === ratedId) return { ok: false, problem: 'self' };
  if (!showedUp(attendance, ratedId)) return { ok: false, problem: 'player_not_found' };

  // the primary key ignores a second rating of the same player, even two sent at once
  const result = await executeWrite(
    `INSERT IGNORE INTO player_ratings
       (game_id, rater_id, rated_id, punctuality, sportsmanship, skill, reliability, overall)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      gameId, raterId, ratedId,
      scores.punctuality, scores.sportsmanship, scores.skill, scores.reliability, scores.overall,
    ],
  );
  if (result.affectedRows === 0) return { ok: false, problem: 'already_rated' };
  return { ok: true };
}

// the most recent games read for a score. Older ones count too little to change it
const GAMES_IN_SCORE = 50;

interface RecentGameRow {
  game_id: number;
  no_show: number;
  rater_count: number;
}

interface ReceivedRatingRow extends RatingScores {
  game_id: number;
}

/*  a player's reputation score, or null if they aren't rated yet. Read from their most
    recent games, newest first by when the game was, with how many others showed up to each.
    Worked out when it's read, since players can still rate a game after it's completed
 */
export async function getReputationScore(userId: number): Promise<number | null> {
  const games = await selectRows<RecentGameRow>(
    `SELECT a.game_id, a.no_show,
            (SELECT COUNT(*) FROM game_attendance other
             WHERE other.game_id = a.game_id AND other.no_show = FALSE AND other.user_id <> a.user_id) AS rater_count
     FROM game_attendance a
     WHERE a.user_id = ?
     ORDER BY a.played_at DESC, a.game_id DESC
     LIMIT ${GAMES_IN_SCORE}`,
    [userId],
  );
  if (games.length === 0) return null;

  const ratings = await selectRows<ReceivedRatingRow>(
    `SELECT game_id, punctuality, sportsmanship, skill, reliability, overall
     FROM player_ratings
     WHERE rated_id = ? AND game_id IN (${games.map(() => '?').join(', ')})`,
    [userId, ...games.map((game) => game.game_id)],
  );
  const played: PlayedGame[] = games.map((game) => ({
    noShow: Number(game.no_show) === 1,
    raterCount: Number(game.rater_count),
    ratings: ratings.filter((rating) => rating.game_id === game.game_id),
  }));
  return reputationScore(played);
}
