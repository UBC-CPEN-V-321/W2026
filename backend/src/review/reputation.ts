// how a player's reputation score is worked out. No database here so the rules are in one place

// the stars given to a player in one rating, each from 1 to MAX_STARS
export interface RatingScores {
  punctuality: number;
  sportsmanship: number;
  skill: number;
  reliability: number;
  overall: number;
}

/*  one game of a player: whether they were a no-show, how many other players showed up
    and could rate them, and the ratings those players gave
 */
export interface PlayedGame {
  noShow: boolean;
  raterCount: number;
  ratings: RatingScores[];
}

// the most stars a category can be given
export const MAX_STARS = 6;
// a score is the average of this many games, new players start with this many default games
export const GAMES_IN_SCORE = 5;
// a player who showed up gets this from anyone who didn't rate them, one below the top
const DEFAULT_RATING = 5;
const NO_SHOW_RATING = 1;
const CATEGORY_COUNT = 5;

function ratingAverage(rating: RatingScores): number {
  return (rating.punctuality + rating.sportsmanship + rating.skill + rating.reliability + rating.overall) / CATEGORY_COUNT;
}

/*  a player's score for one game: a no-show gets the lowest score, otherwise the average
    of every other player who showed up, counting anyone who didn't rate them as DEFAULT_RATING
 */
export function gameScore(game: PlayedGame): number {
  if (game.noShow) return NO_SHOW_RATING;
  if (game.raterCount === 0) return DEFAULT_RATING;
  const rated = game.ratings.reduce((total, rating) => total + ratingAverage(rating), 0);
  return (rated + (game.raterCount - game.ratings.length) * DEFAULT_RATING) / game.raterCount;
}

/*  a player's score: the average of their most recent games, to two decimal places. Until
    they have played GAMES_IN_SCORE games the rest count as DEFAULT_RATING
 */
export function reputationScore(recentGames: PlayedGame[]): number {
  const games = recentGames.slice(0, GAMES_IN_SCORE);
  const played = games.reduce((total, game) => total + gameScore(game), 0);
  const score = (played + (GAMES_IN_SCORE - games.length) * DEFAULT_RATING) / GAMES_IN_SCORE;
  return Math.round(score * 100) / 100;
}
