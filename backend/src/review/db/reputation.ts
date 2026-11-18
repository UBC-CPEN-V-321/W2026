import { selectRows } from '../../core/db/mysql';
import { getReputationScore } from './ratings';

/*  a player's record as other players see it. score is null if they aren't rated yet.
    Badges aren't built yet, so badges is empty
 */
export interface Reputation {
  score: number | null;
  badges: string[];
  gamesPlayed: number;
}

/*  completed games the user showed up to, read from the same attendance the score uses so the
    two always agree. Attendance is kept after they leave a game, and after the game is deleted
 */
const GAMES_PLAYED = `
  SELECT COUNT(*) AS games_played
  FROM game_attendance
  WHERE user_id = ? AND no_show = FALSE`;

// the user's reputation score, badges and games played, used by the public profile
export async function getReputation(userId: number): Promise<Reputation> {
  const rows = await selectRows<{ games_played: number }>(GAMES_PLAYED, [userId]);
  return { score: await getReputationScore(userId), badges: [], gamesPlayed: Number(rows[0]?.games_played ?? 0) };
}