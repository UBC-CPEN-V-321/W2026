import { executeWrite, placeholders, selectRows } from '../../core/db/mysql';
import { RATING_WINDOW_HOURS } from '../ratingWindow';
import type { RatingScores } from '../reputation';

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
     WHERE game_id = ? AND user_id IN (${placeholders(userIds.length)})`,
    [gameId, ...userIds],
  );
}

function showedUp(rows: AttendanceRow[], userId: number): boolean {
  return rows.some((row) => row.user_id === userId && Number(row.no_show) === 0);
}

// whether the game was marked completed less than RATING_WINDOW_HOURS ago, by the database's clock
async function isRatingOpen(gameId: number): Promise<boolean> {
  const rows = await selectRows<{ game_id: number }>(
    `SELECT game_id FROM games
     WHERE game_id = ? AND status = 'completed'
       AND completed_at > UTC_TIMESTAMP() - INTERVAL ${RATING_WINDOW_HOURS} HOUR`,
    [gameId],
  );
  return rows.length > 0;
}

/*  why the user can't rate anyone in this game: they can't rate in it (it isn't completed,
    they weren't in it, or they were a no-show), or rating it has closed
 */
export type CannotRateProblem = 'not_allowed' | 'rating_closed';

// why the user can't rate anyone in this game, or null if they can
async function cannotRate(gameId: number, userId: number, attendance: AttendanceRow[]): Promise<CannotRateProblem | null> {
  if (!showedUp(attendance, userId)) return 'not_allowed';
  return (await isRatingOpen(gameId)) ? null : 'rating_closed';
}

export type PlayersToRateResult =
  | { ok: true; players: PlayerToRate[] }
  | { ok: false; problem: CannotRateProblem };

/*  the other players who showed up to the completed game. Says who the user already rated,
    but never what anyone was rated
 */
export async function getPlayersToRate(gameId: number, userId: number): Promise<PlayersToRateResult> {
  const problem = await cannotRate(gameId, userId, await readAttendance(gameId, [userId]));
  if (problem) return { ok: false, problem };

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
  return {
    ok: true,
    players: rows.map((row) => ({
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      rated: Number(row.rated) === 1,
    })),
  };
}

/*  why the user can't give this rating: they can't rate in this game, rating it has closed,
    it's their own rating, the other player was a no-show or wasn't in the game, or they
    already rated them
 */
export type CreateRatingProblem = CannotRateProblem | 'self' | 'player_not_found' | 'already_rated';

export type CreateRatingResult = { ok: true } | { ok: false; problem: CreateRatingProblem };

// why this player can't be rated by the rater, or null if they can
function cannotBeRated(attendance: AttendanceRow[], raterId: number, ratedId: number): CreateRatingProblem | null {
  if (raterId === ratedId) return 'self';
  return showedUp(attendance, ratedId) ? null : 'player_not_found';
}

// records the user's rating of a player, a rating can't be changed once it's given
export async function createRating(
  gameId: number,
  raterId: number,
  ratedId: number,
  scores: RatingScores,
): Promise<CreateRatingResult> {
  const attendance = await readAttendance(gameId, [raterId, ratedId]);
  const problem = (await cannotRate(gameId, raterId, attendance)) ?? cannotBeRated(attendance, raterId, ratedId);
  if (problem) return { ok: false, problem };

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
  return result.affectedRows === 0 ? { ok: false, problem: 'already_rated' } : { ok: true };
}
