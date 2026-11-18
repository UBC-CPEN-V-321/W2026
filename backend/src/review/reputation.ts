// how a player's reputation score is worked out. No database here so the rules are in one place

// the most stars a category can be given
export const MAX_STARS = 6;

// the stars given to a player in one rating, each from 1 to MAX_STARS
export interface RatingScores {
  punctuality: number;
  sportsmanship: number;
  skill: number;
  reliability: number;
  overall: number;
}

/*  one game the player was in: whether they were a no-show, how many other players showed
    up and could rate them, and the ratings those players gave
 */
export interface PlayedGame {
  noShow: boolean;
  raterCount: number;
  ratings: RatingScores[];
}

/*  the score a player starts from and is pulled toward while they have few games. Also
    what anyone who showed up but didn't rate them is taken to have given
 */
export const BASELINE_SCORE = 5;
// the baseline counts as this many games scoring BASELINE_SCORE
export const BASELINE_WEIGHT = 3;
// every newer game makes each older one count this much as it did before
export const RECENCY_DECAY = 0.9;
// what a game the player didn't show up to scores
export const NO_SHOW_STARS = 1;
/*  once a player showed up to MIN_GAMES_FOR_OUTLIERS games, a game scoring more than
    OUTLIER_DISTANCE stars from the middle of their game scores counts OUTLIER_WEIGHT as
    much as the others
 */
export const MIN_GAMES_FOR_OUTLIERS = 4;
export const OUTLIER_DISTANCE = 1.5;
export const OUTLIER_WEIGHT = 0.25;
const CATEGORY_COUNT = 5;

// a game that counts toward the score, and what it scored
interface CountedGame {
  noShow: boolean;
  stars: number;
}

export function ratingAverage(rating: RatingScores): number {
  return (rating.punctuality + rating.sportsmanship + rating.skill + rating.reliability + rating.overall) / CATEGORY_COUNT;
}

/*  what a game scored: NO_SHOW_STARS for a no-show, otherwise the average over every other
    player who showed up, counting anyone who didn't rate them as BASELINE_SCORE. The order
    ratings were given in doesn't matter. A game nobody else showed up to scores BASELINE_SCORE
 */
function countedGame(game: PlayedGame): CountedGame {
  if (game.noShow) return { noShow: true, stars: NO_SHOW_STARS };
  const raters = Math.max(game.raterCount, game.ratings.length);
  if (raters === 0) return { noShow: false, stars: BASELINE_SCORE };
  const rated = game.ratings.reduce((sum, rating) => sum + ratingAverage(rating), 0);
  return { noShow: false, stars: (rated + (raters - game.ratings.length) * BASELINE_SCORE) / raters };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[middle - 1] ?? upper;
  return sorted.length % 2 === 1 ? upper : (lower + upper) / 2;
}

// the middle of the games they showed up to, or null while there are too few to tell what's unusual
function ratedGamesMiddle(games: CountedGame[]): number | null {
  const rated = games.filter((game) => !game.noShow).map((game) => game.stars);
  return rated.length >= MIN_GAMES_FOR_OUTLIERS ? median(rated) : null;
}

// how much the game at this place (0 is the newest) counts. A no-show is never an outlier
function gameWeight(game: CountedGame, newerCount: number, middle: number | null): number {
  const isOutlier = !game.noShow && middle !== null && Math.abs(game.stars - middle) > OUTLIER_DISTANCE;
  return RECENCY_DECAY ** newerCount * (isOutlier ? OUTLIER_WEIGHT : 1);
}

// whether anything real is known about the player: a rating, or a game they missed
function hasBeenRated(games: PlayedGame[]): boolean {
  return games.some((game) => game.noShow || game.ratings.length > 0);
}

/*  a player's score from the games they were in, newest first, to two decimal places. A
    weighted average of the games that starts from BASELINE_WEIGHT games of BASELINE_SCORE so
    a few games can't make it extreme. Every game counts the same however many players rated
    it. Null if nobody has rated them and they never missed a game
 */
export function reputationScore(games: PlayedGame[]): number | null {
  if (!hasBeenRated(games)) return null;
  const counted = games.map(countedGame);
  const middle = ratedGamesMiddle(counted);
  let total = BASELINE_WEIGHT * BASELINE_SCORE;
  let weights = BASELINE_WEIGHT;
  counted.forEach((game, newerCount) => {
    const weight = gameWeight(game, newerCount, middle);
    total += weight * game.stars;
    weights += weight;
  });
  return Math.round((total / weights) * 100) / 100;
}
