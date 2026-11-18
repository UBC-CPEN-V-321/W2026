import { RatedGame, summarizePlayerStats } from '../../src/ranking/stats';
import { RoundScore } from '../../src/ranking/ranking.types';

// A rated game from the player's side; the player is on team 1 unless given
function ratedGame(
  gameId: string,
  rounds: RoundScore[],
  opponentRatings: number[],
  ratingBefore: number,
  ratingAfter: number,
  team = 1,
): RatedGame {
  return {
    gameId,
    playedAt: new Date(`2026-11-0${gameId.slice(-1)}T17:00:00.000Z`),
    team,
    ratingBefore,
    ratingAfter,
    rounds,
    opponentRatings,
  };
}

// Function summarizePlayerStats
describe('Unit: summarizePlayerStats', () => {

  // Input: no rated games
  // Expected behavior: every total is zero
  // Expected output: zeros, an empty history and no bands
  test('A player with no rated games', () => {
    expect(summarizePlayerStats([])).toEqual({
      gamesPlayed: 0, wins: 0, losses: 0,
      setsPlayed: 0, setsWon: 0, setsLost: 0,
      pointsWon: 0, pointsLost: 0,
      ratingHistory: [],
      vsOpponentRating: [],
    });
  });

  // Input: three games: a straight-sets win on team 1 vs 1450, a three-set loss on team 2 vs 1620,
  //        and a doubles win on team 2 vs opponents averaging 1490 (1400 and 1580)
  // Expected behavior: sets and points are counted from the player's side of each round, and each
  //        game falls in the 100-point band of its (average) opponent rating
  // Expected output: 3 games, 2 wins, 8 sets (5 won), 41-35 points, the history in order and two bands
  test('Totals, history and opponent-rating bands', () => {
    const games = [
      ratedGame('g1', [[6, 3], [6, 4]], [1450], 1500, 1520),
      ratedGame('g2', [[6, 4], [3, 6], [6, 2]], [1620], 1520, 1505, 2),
      ratedGame('g3', [[2, 6], [7, 5], [4, 6]], [1400, 1580], 1505, 1515, 2),
    ];

    const stats = summarizePlayerStats(games);

    expect(stats).toMatchObject({
      gamesPlayed: 3, wins: 2, losses: 1,
      setsPlayed: 8, setsWon: 5, setsLost: 3,
    });
    // Player's side: g1 12-7, g2 (team 2) 12-15, g3 (team 2) 17-13
    expect(stats.pointsWon).toBe(12 + 12 + 17);
    expect(stats.pointsLost).toBe(7 + 15 + 13);
    expect(stats.ratingHistory).toEqual([
      { gameId: 'g1', playedAt: games[0]?.playedAt, ratingBefore: 1500, ratingAfter: 1520 },
      { gameId: 'g2', playedAt: games[1]?.playedAt, ratingBefore: 1520, ratingAfter: 1505 },
      { gameId: 'g3', playedAt: games[2]?.playedAt, ratingBefore: 1505, ratingAfter: 1515 },
    ]);
    expect(stats.vsOpponentRating).toEqual([
      { minRating: 1400, maxRating: 1500, games: 2, wins: 2, losses: 0, averageMargin: (5 + 4) / 2 },
      { minRating: 1600, maxRating: 1700, games: 1, wins: 0, losses: 1, averageMargin: -3 },
    ]);
  });

  // Input: wins against opponents rated exactly 1500 and 1599.9
  // Expected behavior: a band includes its lower bound and everything below the next band
  // Expected output: both games in the 1500 band
  test('Band boundaries', () => {
    const stats = summarizePlayerStats([
      ratedGame('g1', [[6, 0], [6, 0]], [1500], 1500, 1510),
      ratedGame('g2', [[6, 0], [6, 0]], [1599.9], 1510, 1520),
      ratedGame('g3', [[6, 0], [6, 0]], [1600], 1520, 1530),
    ]);

    expect(stats.vsOpponentRating.map(({ minRating, games }) => [minRating, games])).toEqual([
      [1500, 2],
      [1600, 1],
    ]);
  });

  // Input: a rated game whose opponents' ratings are missing
  // Expected behavior: it still counts in the totals and history, but in no band
  // Expected output: 1 game played, no bands
  test('A game without opponent ratings is left out of the bands', () => {
    const stats = summarizePlayerStats([ratedGame('g1', [[6, 3], [6, 3]], [], 1500, 1520)]);

    expect(stats.gamesPlayed).toBe(1);
    expect(stats.ratingHistory).toHaveLength(1);
    expect(stats.vsOpponentRating).toEqual([]);
  });
});
