import { Format } from '../../src/generated/prisma/enums';
import { calculateELOChange, calculateKFactor } from '../../src/ranking/elo';
import { GameInfo, PlayerInfo, RoundScore, Sport } from '../../src/ranking/ranking.types';

// Singles lineup: player-a on team 1, player-b on team 2. Both are new players unless games played are given
function singlesPlayers(ratingA: number, ratingB: number, gamesA = 0, gamesB = 0): PlayerInfo[] {
  return [
    { userId: 'player-a', team: 1, rating: ratingA, gamesPlayed: gamesA },
    { userId: 'player-b', team: 2, rating: ratingB, gamesPlayed: gamesB },
  ];
}

// Doubles lineup: player-a1 and player-a2 on team 1, player-b1 and player-b2 on team 2
// All four are new players unless games played are given, in the same order as the ratings
function doublesPlayers(
  ratingA1: number, ratingA2: number, ratingB1: number, ratingB2: number,
  gamesPlayed: [number, number, number, number] = [0, 0, 0, 0],
): PlayerInfo[] {
  return [
    { userId: 'player-a1', team: 1, rating: ratingA1, gamesPlayed: gamesPlayed[0] },
    { userId: 'player-a2', team: 1, rating: ratingA2, gamesPlayed: gamesPlayed[1] },
    { userId: 'player-b1', team: 2, rating: ratingB1, gamesPlayed: gamesPlayed[2] },
    { userId: 'player-b2', team: 2, rating: ratingB2, gamesPlayed: gamesPlayed[3] },
  ];
}

function singlesGame(scores: RoundScore[], sport: Sport = 'TENNIS'): GameInfo {
  return { sport, format: Format.SINGLES, scores };
}

function doublesGame(scores: RoundScore[], sport: Sport = 'TENNIS'): GameInfo {
  return { sport, format: Format.DOUBLES, scores };
}

// Function calculateELOChange
describe('Unit: calculateELOChange', () => {

  // Input: new 1800-rated A vs new 1500-rated B in tennis singles (K = 131.33), A wins 6-3, 6-4
  // Expected behavior: the favorite wins as expected and gains a small amount
  // Expected output: A gains 21.61, B loses 21.61
  test('Singles, A rating > B rating, player A wins', () => {
    const players: PlayerInfo[] = singlesPlayers(1800, 1500);
    const game: GameInfo = singlesGame([[6, 3], [6, 4]]);

    const [changeA, changeB] = calculateELOChange(players, game);

    expect(changeA?.userId).toBe('player-a');
    expect(changeA?.ratingBefore).toBe(1800);
    expect(changeA?.ratingAfter).toBeCloseTo(1800 + 21.6112596741, 5);

    expect(changeB?.userId).toBe('player-b');
    expect(changeB?.ratingBefore).toBe(1500);
    expect(changeB?.ratingAfter).toBeCloseTo(1500 - 21.6112596741, 5);
  });

  // Input: new 1500-rated A vs new 1800-rated B in tennis singles, A wins 6-4, 7-5
  // Expected behavior: the underdog wins and gains a large amount
  // Expected output: A gains 123.22, B loses 123.22
  test('Singles, A rating < B rating, player A wins (upset)', () => {
    const players: PlayerInfo[] = singlesPlayers(1500, 1800);
    const game: GameInfo = singlesGame([[6, 4], [7, 5]]);

    const [changeA, changeB] = calculateELOChange(players, game);

    expect(changeA?.userId).toBe('player-a');
    expect(changeA?.ratingBefore).toBe(1500);
    expect(changeA?.ratingAfter).toBeCloseTo(1500 + 123.2151305461, 5);

    expect(changeB?.userId).toBe('player-b');
    expect(changeB?.ratingBefore).toBe(1800);
    expect(changeB?.ratingAfter).toBeCloseTo(1800 - 123.2151305461, 5);
  });

  // Input: new 2000-rated A vs new 1400-rated B in tennis singles, A wins 7-6, 7-6
  // Expected behavior: the heavy favorite won by less than expected, so the margin term outweighs the win
  // Expected output: A loses 1.12, B gains 1.12
  test('Singles, A rating >> B rating, A wins narrowly and loses rating', () => {
    const players: PlayerInfo[] = singlesPlayers(2000, 1400);
    const game: GameInfo = singlesGame([[7, 6], [7, 6]]);

    const [changeA, changeB] = calculateELOChange(players, game);

    expect(changeA?.ratingAfter).toBeLessThan(2000);
    expect(changeA?.ratingAfter).toBeCloseTo(2000 - 1.1207299689, 5);
    expect(changeB?.ratingAfter).toBeCloseTo(1400 + 1.1207299689, 5);
  });

  // Input: two new 1500-rated players in tennis singles, A wins 6-4, 6-3
  // Expected behavior: E_A = 0.5 and E_MOV = 0, so Δ = 131.33 * 0.5 + 1.5 * 5 = 73.16
  // Expected output: A = 1573.16, B = 1426.84
  test('Singles, equal ratings, player A wins', () => {
    const players: PlayerInfo[] = singlesPlayers(1500, 1500);
    const game: GameInfo = singlesGame([[6, 4], [6, 3]]);

    const [changeA, changeB] = calculateELOChange(players, game);

    expect(changeA?.ratingAfter).toBeCloseTo(1500 + 73.1631951101, 5);
    expect(changeB?.ratingAfter).toBeCloseTo(1500 - 73.1631951101, 5);
  });

  // Input: new 1500-rated A vs new 1700-rated B in tennis singles, B wins 2 rounds to 1
  // Expected behavior: the favorite wins as expected and gains a small amount
  // Expected output: A loses 31.89, B gains 31.89
  test('Singles, A rating < B rating, player B wins in three rounds', () => {
    const players: PlayerInfo[] = singlesPlayers(1500, 1700);
    const game: GameInfo = singlesGame([[6, 4], [4, 6], [3, 6]]);

    const [changeA, changeB] = calculateELOChange(players, game);

    expect(changeA?.userId).toBe('player-a');
    expect(changeA?.ratingAfter).toBeCloseTo(1500 - 31.8925144473, 5);

    expect(changeB?.userId).toBe('player-b');
    expect(changeB?.ratingAfter).toBeCloseTo(1700 + 31.8925144473, 5);
  });
});

describe('Unit: calculateELOChange — behavior', () => {
  const players: PlayerInfo[] = singlesPlayers(1500, 1500);

  // Input: the same matchup won 7-5, 7-5 and won 6-1, 6-1
  // Expected behavior: a bigger margin of victory earns more rating
  // Expected output: the blowout winner ends higher than the narrow winner
  test('Bigger winning margin gives a bigger rating gain', () => {
    const narrow = calculateELOChange(players, singlesGame([[7, 5], [7, 5]]));
    const blowout = calculateELOChange(players, singlesGame([[6, 1], [6, 1]]));

    expect(blowout[0]?.ratingAfter).toBeGreaterThan(narrow[0]?.ratingAfter ?? Infinity);
  });

  // Input: the same matchup won 8-6, 6-4 and won 99-97, 6-4: a long advantage set against a short one
  // Expected behavior: the margin of victory counts the games difference, 2 in both sets, not their size
  // Expected output: the same rating change for both players
  test('A long set won by 2 counts like a short set won by 2', () => {
    const short = calculateELOChange(players, singlesGame([[8, 6], [6, 4]]));
    const long = calculateELOChange(players, singlesGame([[99, 97], [6, 4]]));

    expect(long).toEqual(short);
  });

  // Input: the same 7-5, 7-5 win by a 1500-rated player against a 1300 and a 1700
  // Expected behavior: beating a stronger opponent earns more rating
  // Expected output: the upset winner gains more than the favorite
  test('Beating a stronger opponent gives a bigger rating gain', () => {
    const game: GameInfo = singlesGame([[7, 5], [7, 5]]);
    const vsWeaker = calculateELOChange(
      singlesPlayers(1500, 1300),
      game,
    );
    const vsStronger = calculateELOChange(
      singlesPlayers(1500, 1700),
      game,
    );

    expect(vsStronger[0]?.ratingAfter).toBeGreaterThan(vsWeaker[0]?.ratingAfter ?? Infinity);
  });

  // Input: the same singles game with the team 2 player listed first
  // Expected behavior: player order does not affect the result; output lists team 1 first
  // Expected output: same rating changes as with team 1 listed first
  test('Singles, player order does not matter', () => {
    const game: GameInfo = singlesGame([[6, 3], [6, 4]]);
    const playerA: PlayerInfo = { userId: 'player-a', team: 1, rating: 1800, gamesPlayed: 0 };
    const playerB: PlayerInfo = { userId: 'player-b', team: 2, rating: 1500, gamesPlayed: 0 };

    const inOrder = calculateELOChange([playerA, playerB], game);
    const swapped = calculateELOChange([playerB, playerA], game);

    expect(swapped).toEqual(inOrder);
  });

  // Input: the same doubles game with players listed as A B A B, B A B A, B B A A and A B B A
  // Expected behavior: player order does not affect the result
  // Expected output: each player gets the same rating change in every order
  test('Doubles, player order does not matter', () => {
    const game: GameInfo = doublesGame([[6, 3], [6, 4]]);
    const a1: PlayerInfo = { userId: 'player-a1', team: 1, rating: 1700, gamesPlayed: 0 };
    const a2: PlayerInfo = { userId: 'player-a2', team: 1, rating: 1600, gamesPlayed: 0 };
    const b1: PlayerInfo = { userId: 'player-b1', team: 2, rating: 1500, gamesPlayed: 0 };
    const b2: PlayerInfo = { userId: 'player-b2', team: 2, rating: 1400, gamesPlayed: 0 };

    const inOrder = calculateELOChange([a1, a2, b1, b2], game);
    const byUserId = (changes: typeof inOrder) =>
      [...changes].sort((x, y) => x.userId.localeCompare(y.userId));

    const shuffledOrders = [
      [a1, b1, a2, b2],   // A B A B
      [b2, a1, b1, a2],   // B A B A
      [b1, b2, a1, a2],   // B B A A
      [a1, b1, b2, a2],   // A B B A
    ];
    for (const order of shuffledOrders) {
      expect(byUserId(calculateELOChange(order, game))).toEqual(byUserId(inOrder));
    }
  });
});

describe('Unit: calculateELOChange — doubles', () => {

  // Input: new players, team 1 (1700, 1600) vs team 2 (1500, 1400) in tennis doubles, team 1 wins 6-3, 6-4
  // Expected behavior: team Δ = 34.89, each player receives half
  // Expected output: team 1 players gain 17.45, team 2 players lose 17.45
  test('Doubles, team 1 average > team 2 average, team 1 wins', () => {
    const players: PlayerInfo[] = doublesPlayers(1700, 1600, 1500, 1400);
    const game: GameInfo = doublesGame([[6, 3], [6, 4]]);

    const [a1, a2, b1, b2] = calculateELOChange(players, game);

    expect(a1?.userId).toBe('player-a1');
    expect(a1?.ratingAfter).toBeCloseTo(1700 + 17.4462572236, 5);
    expect(a2?.userId).toBe('player-a2');
    expect(a2?.ratingAfter).toBeCloseTo(1600 + 17.4462572236, 5);
    expect(b1?.userId).toBe('player-b1');
    expect(b1?.ratingAfter).toBeCloseTo(1500 - 17.4462572236, 5);
    expect(b2?.userId).toBe('player-b2');
    expect(b2?.ratingAfter).toBeCloseTo(1400 - 17.4462572236, 5);
  });

  // Input: new players, team 1 (1600, 1500) vs team 2 (1400, 1300) in tennis doubles, team 2 wins 2 rounds to 1
  // Expected behavior: team Δ = -106.93, each player receives half
  // Expected output: team 1 players lose 53.47, team 2 players gain 53.47
  test('Doubles, team 1 average > team 2 average, team 2 wins (upset)', () => {
    const players: PlayerInfo[] = doublesPlayers(1600, 1500, 1400, 1300);
    const game: GameInfo = doublesGame([[4, 6], [6, 3], [3, 6]]);

    const [a1, a2, b1, b2] = calculateELOChange(players, game);

    expect(a1?.ratingAfter).toBeCloseTo(1600 - 53.4669378864, 5);
    expect(a2?.ratingAfter).toBeCloseTo(1500 - 53.4669378864, 5);
    expect(b1?.ratingAfter).toBeCloseTo(1400 + 53.4669378864, 5);
    expect(b2?.ratingAfter).toBeCloseTo(1300 + 53.4669378864, 5);
  });

  // Input: new players, team 1 (1900, 1300) vs team 2 (1550, 1550) in tennis doubles, team 1 wins 2 rounds to 1
  // Expected behavior: team 1 average is 1600 vs 1550, team Δ = 59.66; teammates with the same K move by the same amount regardless of their own rating
  // Expected output: team 1 players gain 29.83, team 2 players lose 29.83
  test('Doubles, uneven teammates move by the same amount', () => {
    const players: PlayerInfo[] = doublesPlayers(1900, 1300, 1550, 1550);
    const game: GameInfo = doublesGame([[6, 4], [3, 6], [6, 2]]);

    const [a1, a2, b1, b2] = calculateELOChange(players, game);

    expect(a1?.ratingAfter).toBeCloseTo(1900 + 29.8295124255, 5);
    expect(a2?.ratingAfter).toBeCloseTo(1300 + 29.8295124255, 5);
    expect(b1?.ratingAfter).toBeCloseTo(1550 - 29.8295124255, 5);
    expect(b2?.ratingAfter).toBeCloseTo(1550 - 29.8295124255, 5);
  });
});

describe('Unit: calculateELOChange — invalid players', () => {
  const validDoublesGame: GameInfo = doublesGame([[6, 3], [6, 4]]);
  const validSinglesGame: GameInfo = singlesGame([[6, 3], [6, 4]]);

  // Input: three team 1 players and one team 2 player
  // Expected behavior: rejected because each team needs two players
  // Expected output: throws "two players on each team"
  test('Doubles, 3 vs 1 grouping throws', () => {
    const players: PlayerInfo[] = [
      { userId: 'player-a1', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-a2', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-a3', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-b1', team: 2, rating: 1500, gamesPlayed: 0 },
    ];

    expect(() => calculateELOChange(players, validDoublesGame)).toThrow('two players on each team');
  });

  // Input: a doubles game with only 2 players
  // Expected behavior: rejected because doubles needs 4 players
  // Expected output: throws "exactly 4 players"
  test('Doubles with only 2 players throws', () => {
    const players: PlayerInfo[] = singlesPlayers(1500, 1500);

    expect(() => calculateELOChange(players, validDoublesGame)).toThrow('exactly 4 players');
  });

  // Input: a doubles game with 5 players (3 on team 1)
  // Expected behavior: rejected instead of silently ignoring the extra player
  // Expected output: throws "exactly 4 players"
  test('Doubles with 5 players throws', () => {
    const players: PlayerInfo[] = [
      { userId: 'player-a1', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-a2', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-a3', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-b1', team: 2, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-b2', team: 2, rating: 1500, gamesPlayed: 0 },
    ];

    expect(() => calculateELOChange(players, validDoublesGame)).toThrow('exactly 4 players');
  });

  // Input: singles players both on team 1
  // Expected behavior: rejected because team 2 has no player
  // Expected output: throws "one player on each team"
  test('Singles with both players on the same team throws', () => {
    const players: PlayerInfo[] = [
      { userId: 'player-a', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-b', team: 1, rating: 1500, gamesPlayed: 0 },
    ];

    expect(() => calculateELOChange(players, validSinglesGame)).toThrow('one player on each team');
  });

  // Input: a singles game where the same user is listed on both teams
  // Expected behavior: rejected because one user would get two opposite rating changes
  // Expected output: throws "unique userId"
  test('Same user on both teams throws', () => {
    const players: PlayerInfo[] = [
      { userId: 'player-a', team: 1, rating: 1500, gamesPlayed: 0 },
      { userId: 'player-a', team: 2, rating: 1500, gamesPlayed: 0 },
    ];

    expect(() => calculateELOChange(players, validSinglesGame)).toThrow('unique userId');
  });

  // Input: a singles game where one player's rating is NaN, Infinity or -Infinity
  // Expected behavior: rejected instead of producing NaN or infinite ratings
  // Expected output: throws "not finite" for each
  test.each([NaN, Infinity, -Infinity])('Singles with a rating of %p throws', (badRating) => {
    const players: PlayerInfo[] = singlesPlayers(badRating, 1500);

    expect(() => calculateELOChange(players, validSinglesGame)).toThrow('not finite');
  });

  // Input: a doubles game where one player's rating is NaN, Infinity or -Infinity
  // Expected behavior: rejected instead of turning the team average and every rating into NaN or infinity
  // Expected output: throws "not finite" for each
  test.each([NaN, Infinity, -Infinity])('Doubles with a rating of %p throws', (badRating) => {
    const players: PlayerInfo[] = doublesPlayers(1500, badRating, 1500, 1500);

    expect(() => calculateELOChange(players, validDoublesGame)).toThrow('not finite');
  });

  // Input: a singles game with 4 players
  // Expected behavior: rejected because singles needs 2 players
  // Expected output: throws "exactly 2 players"
  test('Singles with 4 players throws', () => {
    const players: PlayerInfo[] = doublesPlayers(1500, 1500, 1500, 1500);

    expect(() => calculateELOChange(players, validSinglesGame)).toThrow('exactly 2 players');
  });
});

describe('Unit: calculateELOChange — invalid scores', () => {
  const players: PlayerInfo[] = singlesPlayers(1500, 1500);

  // Input: a singles game with no rounds
  // Expected behavior: rejected because there is nothing to score
  // Expected output: throws "no round score information"
  test('Empty scores throws', () => {
    const game: GameInfo = singlesGame([]);

    expect(() => calculateELOChange(players, game)).toThrow('no round score information');
  });

  // Input: a tennis game where the second round is 5-5
  // Expected behavior: rejected because rounds cannot tie
  // Expected output: throws "cannot be tied"
  test('A tied round throws', () => {
    const game: GameInfo = singlesGame([[6, 3], [5, 5]]);

    expect(() => calculateELOChange(players, game)).toThrow('cannot be tied');
  });

  // Input: a tennis game where each side won one round
  // Expected behavior: rejected because the match has no winner
  // Expected output: throws "no winner"
  test('Both sides winning the same number of rounds throws', () => {
    const game: GameInfo = singlesGame([[6, 3], [4, 6]]);

    expect(() => calculateELOChange(players, game)).toThrow('no winner');
  });

  // Input: rounds containing NaN, a negative score, and a decimal score
  // Expected behavior: rejected instead of producing NaN or meaningless ratings
  // Expected output: throws "non-negative integer" for each
  const invalidRounds: [string, RoundScore[]][] = [
    ['NaN', [[6, 3], [NaN, 4]]],
    ['negative', [[6, 3], [-1, 4]]],
    ['decimal', [[6, 3], [6.5, 4]]],
  ];
  test.each(invalidRounds)('Round with a %s score throws', (_label, scores) => {
    const game: GameInfo = singlesGame(scores);

    expect(() => calculateELOChange(players, game)).toThrow('non-negative integer');
  });
});

// Function calculateKFactor
describe('Unit: calculateKFactor', () => {

  // Input: tennis players with 0, 10 and 100 rated games
  // Expected behavior: K = 250 / (games + 5)^0.4, so new players move faster than established ones
  // Expected output: 131.33, 84.63 and 38.86
  test.each([
    [0, 131.3263902202],
    [10, 84.6259398665],
    [100, 38.8565545862],
  ])('Tennis K after %i games', (gamesPlayed, expected) => {
    expect(calculateKFactor('TENNIS', gamesPlayed)).toBeCloseTo(expected, 8);
  });

  // Input: tennis players with more and more games
  // Expected behavior: K never grows as a player plays more
  // Expected output: each K is below the previous one
  test('Tennis K decreases with games played', () => {
    const ks = [0, 1, 5, 20, 50, 200].map((games) => calculateKFactor('TENNIS', games));
    ks.slice(1).forEach((k, index) => {
      expect(k).toBeLessThan(ks.at(index) ?? -Infinity);
    });
  });

  // Input: badminton players with 0, 8 and 500 rated games
  // Expected behavior: badminton uses a fixed K
  // Expected output: 32 every time
  test.each([0, 8, 500])('Badminton K after %i games is 32', (gamesPlayed) => {
    expect(calculateKFactor('BADMINTON', gamesPlayed)).toBe(32);
  });

  // Input: pickleball players around the end of the 8-game placement period
  // Expected behavior: K is doubled to 120 for the first 8 games (0 to 7 played), then 60
  // Expected output: 120 for 0 and 7 games, 60 for 8, 9 and 100 games
  test.each([
    [0, 120],
    [7, 120],
    [8, 60],
    [9, 60],
    [100, 60],
  ])('Pickleball K after %i games is %i', (gamesPlayed, expected) => {
    expect(calculateKFactor('PICKLEBALL', gamesPlayed)).toBe(expected);
  });

  // Input: a negative, decimal, NaN or infinite games-played count
  // Expected behavior: rejected instead of producing a meaningless K
  // Expected output: throws "Games played must be a non-negative integer"
  test.each([-1, 2.5, NaN, Infinity])('Games played of %p throws', (gamesPlayed) => {
    expect(() => calculateKFactor('TENNIS', gamesPlayed)).toThrow('Games played must be a non-negative integer');
  });
});

describe('Unit: calculateELOChange — K from games played', () => {

  // Input: two 1500-rated tennis players, A is new (K = 131.33) and B has 100 games (K = 38.86), A wins 6-4, 6-3
  // Expected behavior: each player uses their own K, so the new player moves more than the established one
  // Expected output: A gains 73.16 (131.33 * 0.5 + 7.5), B loses 26.93 (38.86 * 0.5 + 7.5)
  test('Singles, each player uses their own K', () => {
    const players = singlesPlayers(1500, 1500, 0, 100);
    const game = singlesGame([[6, 4], [6, 3]]);

    const [changeA, changeB] = calculateELOChange(players, game);

    expect(changeA?.ratingAfter).toBeCloseTo(1500 + 73.1631951101, 5);
    expect(changeB?.ratingAfter).toBeCloseTo(1500 - 26.9282772931, 5);
  });

  // Input: the same tennis win for players with 0, 10 and 100 games against an opponent with the same count
  // Expected behavior: the more games both players have, the less the result moves their ratings
  // Expected output: A's gain shrinks as games played grows
  test('Tennis, established players move less than new players', () => {
    const game = singlesGame([[6, 4], [6, 3]]);
    const gain = (games: number) =>
      (calculateELOChange(singlesPlayers(1500, 1500, games, games), game)[0]?.ratingAfter ?? NaN) - 1500;

    expect(gain(0)).toBeGreaterThan(gain(10));
    expect(gain(10)).toBeGreaterThan(gain(100));
    expect(gain(10)).toBeCloseTo(84.6259398665 * 0.5 + 7.5, 5);
  });

  // Input: 1600-rated A vs 1500-rated B in badminton singles, A wins 21-15, 21-18
  // Expected behavior: matches the worked example in the design note (K = 32, α = 15, β = 0.005, λ = 0.5)
  // Expected output: A gains 12.55, B loses 12.55
  test('Badminton singles matches the worked example', () => {
    const [changeA, changeB] = calculateELOChange(
      singlesPlayers(1600, 1500),
      singlesGame([[21, 15], [21, 18]], 'BADMINTON'),
    );

    expect(changeA?.ratingAfter).toBeCloseTo(1600 + 12.5520413269, 5);
    expect(changeB?.ratingAfter).toBeCloseTo(1500 - 12.5520413269, 5);
  });

  // Input: team 1 (1650, 1550) vs team 2 (1480, 1520) in badminton doubles, team 2 wins 2 games to 1
  // Expected behavior: matches the doubles worked example in the design note
  // Expected output: team 1 players lose 12.22, team 2 players gain 12.22
  test('Badminton doubles matches the worked example', () => {
    const [a1, a2, b1, b2] = calculateELOChange(
      doublesPlayers(1650, 1550, 1480, 1520),
      doublesGame([[19, 21], [21, 17], [18, 21]], 'BADMINTON'),
    );

    expect(a1?.ratingAfter).toBeCloseTo(1650 - 12.2239793366, 5);
    expect(a2?.ratingAfter).toBeCloseTo(1550 - 12.2239793366, 5);
    expect(b1?.ratingAfter).toBeCloseTo(1480 + 12.2239793366, 5);
    expect(b2?.ratingAfter).toBeCloseTo(1520 + 12.2239793366, 5);
  });

  // Input: two 1500-rated pickleball players, A wins 11-7, 11-9 (margin +6, λ = 1), with 7 and with 8 games played each
  // Expected behavior: at 7 games both are still in placement (K = 120); at 8 games K drops to 60
  // Expected output: Δ = 120 * 0.5 + 6 = 66 at 7 games, 60 * 0.5 + 6 = 36 at 8 games
  test.each([
    [7, 66],
    [8, 36],
  ])('Pickleball, both players with %i games, winner gains %i', (games, expected) => {
    const [changeA, changeB] = calculateELOChange(
      singlesPlayers(1500, 1500, games, games),
      singlesGame([[11, 7], [11, 9]], 'PICKLEBALL'),
    );

    expect(changeA?.ratingAfter).toBeCloseTo(1500 + expected, 8);
    expect(changeB?.ratingAfter).toBeCloseTo(1500 - expected, 8);
  });

  // Input: the same pickleball game, A has 7 games (placement) and B has 8 games
  // Expected behavior: only A gets the doubled K
  // Expected output: A gains 66, B loses 36
  test('Pickleball, placement K only applies to the player still in placement', () => {
    const [changeA, changeB] = calculateELOChange(
      singlesPlayers(1500, 1500, 7, 8),
      singlesGame([[11, 7], [11, 9]], 'PICKLEBALL'),
    );

    expect(changeA?.ratingAfter).toBeCloseTo(1566, 8);
    expect(changeB?.ratingAfter).toBeCloseTo(1464, 8);
  });

  // Input: four 1500-rated tennis players with 0, 100, 10 and 8 games, team 1 wins 6-4, 6-4
  // Expected behavior: each player gets half of (their own K * 0.5 + 1.5 * 4)
  // Expected output: +35.83, +12.71, -24.16, -25.40
  test('Doubles, each player uses their own K', () => {
    const [a1, a2, b1, b2] = calculateELOChange(
      doublesPlayers(1500, 1500, 1500, 1500, [0, 100, 10, 8]),
      doublesGame([[6, 4], [6, 4]]),
    );

    expect(a1?.ratingAfter).toBeCloseTo(1500 + 35.8315975550, 5);
    expect(a2?.ratingAfter).toBeCloseTo(1500 + 12.7141386465, 5);
    expect(b1?.ratingAfter).toBeCloseTo(1500 - 24.1564849666, 5);
    expect(b2?.ratingAfter).toBeCloseTo(1500 - 25.4028193271, 5);
  });

  // Input: a doubles game where one player's games-played count is negative
  // Expected behavior: rejected before any rating is calculated
  // Expected output: throws "Games played must be a non-negative integer"
  test('A negative games-played count throws', () => {
    expect(() => calculateELOChange(
      doublesPlayers(1500, 1500, 1500, 1500, [0, 0, -1, 0]),
      doublesGame([[6, 4], [6, 4]]),
    )).toThrow('Games played must be a non-negative integer');
  });
});
