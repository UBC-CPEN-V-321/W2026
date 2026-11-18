import type { ParseResult } from '../../core/validation';
import { MAX_STARS, type RatingScores } from '../reputation';

/*  body of POST /api/games/:gameId/ratings. Fields are unknown until checked since they
    come straight from the request
 */
export interface RatingBody {
  rated_user_id?: unknown;
  punctuality?: unknown;
  sportsmanship?: unknown;
  skill?: unknown;
  reliability?: unknown;
  overall?: unknown;
}

export interface NewRating {
  ratedUserId: number;
  scores: RatingScores;
}

function isPositiveWholeNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isStars(value: unknown): boolean {
  return isPositiveWholeNumber(value) && value <= MAX_STARS;
}

// what's wrong with the categories, naming each invalid one, or null if they're all valid
function invalidStars(stars: Record<keyof RatingScores, unknown>): string | null {
  const invalid = Object.entries(stars).filter(([, value]) => !isStars(value)).map(([category]) => category);
  return invalid.length > 0 ? `${invalid.join(', ')} must be a whole number from 1 to ${MAX_STARS}` : null;
}

/*  checks who is rated and that every category is a whole number of stars from 1 to MAX_STARS.
    Returns a description of the problem if anything is invalid, naming the categories
 */
export function parseRating(body: RatingBody = {}): ParseResult<NewRating> {
  const { rated_user_id: ratedUserId, punctuality, sportsmanship, skill, reliability, overall } = body;
  if (!isPositiveWholeNumber(ratedUserId)) return { ok: false, error: 'rated_user_id must be a user id' };

  const stars = { punctuality, sportsmanship, skill, reliability, overall };
  const error = invalidStars(stars);
  return error ? { ok: false, error } : { ok: true, value: { ratedUserId, scores: stars as RatingScores } };
}
