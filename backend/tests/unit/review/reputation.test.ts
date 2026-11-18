import { type PlayedGame, type RatingScores, reputationScore } from '../../../src/review/reputation';

function stars(value: number): RatingScores {
  return { punctuality: value, sportsmanship: value, skill: value, reliability: value, overall: value };
}

/*  a game the player showed up to with raterCount other players, one rating per value
    giving every category that many stars. The others didn't rate them
 */
function game(raterCount: number, ...values: number[]): PlayedGame {
  return { noShow: false, raterCount, ratings: values.map(stars) };
}

// a game rated 6, 2 or 1 stars by its only other player
const SIX = game(1, 6);
const TWO = game(1, 2);
const ONE = game(1, 1);

const NO_SHOW: PlayedGame = { noShow: true, raterCount: 3, ratings: [] };

// games are newest first. Every expected score is (3 × 5 + Σ weight × game score) / (3 + Σ weight)
describe('reputationScore', () => {
  test('a player nobody rated and who never missed a game is not rated yet', () => {
    expect(reputationScore([])).toBeNull();
    // played two games, but nobody rated them
    expect(reputationScore([game(3), game(0)])).toBeNull();
  });

  test('one rated game moves the score from 5 only part of the way', () => {
    // (15 + 6) / 4
    expect(reputationScore([SIX])).toBe(5.25);
    // (15 + 1) / 4
    expect(reputationScore([ONE])).toBe(4);
  });

  test('every rating is averaged across its five categories', () => {
    const rated: PlayedGame = {
      noShow: false,
      raterCount: 1,
      ratings: [{ punctuality: 1, sportsmanship: 2, skill: 3, reliability: 4, overall: 5 }],
    };
    // the rating averages 3: (15 + 3) / 4
    expect(reputationScore([rated])).toBe(4.5);
  });

  test('a game scores the average of its ratings, whatever order they were given in', () => {
    // 1 and 6 stars average 3.5: (15 + 3.5) / 4
    expect(reputationScore([game(2, 1, 6)])).toBe(4.63);
    expect(reputationScore([game(2, 6, 1)])).toBe(4.63);
  });

  test('a player who showed up but did not rate counts as giving 5', () => {
    // one of three gave 6, the game scores (6 + 5 + 5) / 3: (15 + 5.33) / 4
    expect(reputationScore([game(3, 6)])).toBe(5.08);
  });

  test('a game nobody rated scores 5, even if nobody else showed up', () => {
    // newest first: (15 + 5 + 0.9 × 6) / 4.9
    expect(reputationScore([game(2), SIX])).toBe(5.18);
    expect(reputationScore([game(0), SIX])).toBe(5.18);
  });

  test('every game counts the same however many players rated it', () => {
    expect(reputationScore([game(8, 6, 6, 6, 6, 6, 6, 6, 6), TWO])).toBe(reputationScore([SIX, TWO]));
  });

  test('a no-show counts as a game scoring 1', () => {
    expect(reputationScore([NO_SHOW])).toBe(reputationScore([ONE]));
  });

  test('a newer game counts more than an older one', () => {
    // (15 + 6 + 0.9 × 2) / 4.9
    expect(reputationScore([SIX, TWO])).toBe(4.65);
    // the same games the other way round: (15 + 2 + 0.9 × 6) / 4.9
    expect(reputationScore([TWO, SIX])).toBe(4.57);
  });

  test('many games move the score toward what the player is rated', () => {
    expect(reputationScore(Array.from({ length: 10 }, () => SIX))).toBe(5.68);
  });

  test('a game far from the rest counts a quarter as much once they showed up to four games', () => {
    // the 1 star game is 5 stars from the middle (6), so its weight is 0.25 instead of 1
    expect(reputationScore([ONE, SIX, SIX, SIX])).toBe(5.25);
  });

  test('with fewer than four games no game is treated as unusual', () => {
    expect(reputationScore([ONE, SIX, SIX])).toBe(4.6);
  });

  test('a no-show always counts in full, even far from the other games', () => {
    expect(reputationScore([NO_SHOW, SIX, SIX, SIX, SIX])).toBe(4.87);
  });

  test('the score stays between 1 and 6', () => {
    const worst = reputationScore(Array.from({ length: 50 }, () => NO_SHOW)) ?? 0;
    const best = reputationScore(Array.from({ length: 50 }, () => SIX)) ?? 0;
    expect(worst).toBeGreaterThanOrEqual(1);
    expect(best).toBeLessThanOrEqual(6);
  });
});
