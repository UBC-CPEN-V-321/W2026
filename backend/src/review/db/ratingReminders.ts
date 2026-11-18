import { executeWrite, inTransaction, selectRows } from '../../core/db/mysql';
import { RATING_WINDOW_HOURS, REMINDER_BEFORE_CLOSE_HOURS } from '../ratingWindow';

// a completed game whose rating closes within REMINDER_BEFORE_CLOSE_HOURS
export interface ReminderGame {
  gameId: number;
  title: string;
}

/*  completed games whose rating closes within REMINDER_BEFORE_CLOSE_HOURS and haven't had
    their reminder yet, marked reminded as they're returned. The rows stay locked until
    they're marked, so a second check running at the same time can't return them too
 */
export async function claimDueRatingReminders(): Promise<ReminderGame[]> {
  return inTransaction(async (connection) => {
    const due = await selectRows<{ game_id: number; title: string }>(
      `SELECT game_id, title FROM games
       WHERE status = 'completed' AND rating_reminder_sent = FALSE
         AND completed_at <= UTC_TIMESTAMP() - INTERVAL ${RATING_WINDOW_HOURS - REMINDER_BEFORE_CLOSE_HOURS} HOUR
         AND completed_at > UTC_TIMESTAMP() - INTERVAL ${RATING_WINDOW_HOURS} HOUR
       FOR UPDATE`,
      [],
      connection,
    );
    if (due.length > 0) {
      await executeWrite(
        `UPDATE games SET rating_reminder_sent = TRUE WHERE game_id IN (${due.map(() => '?').join(', ')})`,
        due.map((game) => game.game_id),
        connection,
      );
    }
    return due.map((game) => ({ gameId: game.game_id, title: game.title }));
  });
}

// the players who showed up to the game and still haven't rated someone else who did
export async function getPlayersWithRatingsLeft(gameId: number): Promise<number[]> {
  const rows = await selectRows<{ user_id: number }>(
    `SELECT a.user_id FROM game_attendance a
     WHERE a.game_id = ? AND a.no_show = FALSE
       AND EXISTS (
         SELECT 1 FROM game_attendance other
         WHERE other.game_id = a.game_id AND other.no_show = FALSE AND other.user_id <> a.user_id
           AND NOT EXISTS (SELECT 1 FROM player_ratings r
                           WHERE r.game_id = a.game_id AND r.rater_id = a.user_id AND r.rated_id = other.user_id))`,
    [gameId],
  );
  return rows.map((row) => row.user_id);
}
