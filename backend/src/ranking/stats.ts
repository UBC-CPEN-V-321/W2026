// Pure player statistics: totals, the rating history and results by opponent rating, from a player's rated games
import { RoundScore } from './ranking.types';

// Width of the opponent-rating bands, e.g. 1500 up to (not including) 1600
export const OPPONENT_BAND_WIDTH = 100;

// One rated game from the player's side
export interface RatedGame {
    gameId: string;
    playedAt: Date;
    team: number;               // the player's team, 1 or 2
    ratingBefore: number;
    ratingAfter: number;
    rounds: RoundScore[];       // [team 1 score, team 2 score] of each round, in order
    opponentRatings: number[];  // each opponent's rating before the game
}

// A point of the rating chart: the player's rating before and after one game
export interface RatingPoint {
    gameId: string;
    playedAt: Date;
    ratingBefore: number;
    ratingAfter: number;
}

// The player's results against opponents whose (average) rating before the game was
// at least minRating and below maxRating
export interface OpponentRatingBand {
    minRating: number;
    maxRating: number;
    games: number;
    wins: number;
    losses: number;
    averageMargin: number;      // the player's points minus the opponents' points, per game
}

export interface PlayerStats {
    gamesPlayed: number;
    wins: number;
    losses: number;
    setsPlayed: number;
    setsWon: number;
    setsLost: number;
    pointsWon: number;          // games in tennis, summed over every set
    pointsLost: number;
    ratingHistory: RatingPoint[];
    vsOpponentRating: OpponentRatingBand[];
}

interface BandTotals {
    games: number;
    wins: number;
    marginTotal: number;
}

/**
 * Summarizes a player's rated games.
 * A game is won by the side that won more rounds; margins use points, as in the Elo calculation.
 * In doubles, the opponent rating is the average of the two opponents' ratings.
 *
 * @param games - The player's rated games, oldest first
 * @returns The player's totals, rating history (oldest first) and results by opponent
 *          rating band (lowest band first, only bands with games)
 */
export function summarizePlayerStats(games: RatedGame[]): PlayerStats {
    const stats: PlayerStats = {
        gamesPlayed: 0, wins: 0, losses: 0,
        setsPlayed: 0, setsWon: 0, setsLost: 0,
        pointsWon: 0, pointsLost: 0,
        ratingHistory: [],
        vsOpponentRating: [],
    };
    const bands = new Map<number, BandTotals>();

    for (const game of games) {
        let setsWon = 0;
        let setsLost = 0;
        let pointsWon = 0;
        let pointsLost = 0;

        for (const [team1Score, team2Score] of game.rounds) {
            const mine = game.team === 1 ? team1Score : team2Score;
            const theirs = game.team === 1 ? team2Score : team1Score;
            if (mine > theirs) {
                setsWon++;
            } else {
                setsLost++;
            }
            pointsWon += mine;
            pointsLost += theirs;
        }

        const won = setsWon > setsLost;
        stats.gamesPlayed++;
        stats.wins += won ? 1 : 0;
        stats.losses += won ? 0 : 1;
        stats.setsPlayed += setsWon + setsLost;
        stats.setsWon += setsWon;
        stats.setsLost += setsLost;
        stats.pointsWon += pointsWon;
        stats.pointsLost += pointsLost;
        stats.ratingHistory.push({
            gameId: game.gameId,
            playedAt: game.playedAt,
            ratingBefore: game.ratingBefore,
            ratingAfter: game.ratingAfter,
        });

        if (game.opponentRatings.length > 0) {
            const opponentRating =
                game.opponentRatings.reduce((sum, rating) => sum + rating, 0) / game.opponentRatings.length;
            const band = Math.floor(opponentRating / OPPONENT_BAND_WIDTH) * OPPONENT_BAND_WIDTH;
            const totals = bands.get(band) ?? { games: 0, wins: 0, marginTotal: 0 };
            totals.games++;
            totals.wins += won ? 1 : 0;
            totals.marginTotal += pointsWon - pointsLost;
            bands.set(band, totals);
        }
    }

    stats.vsOpponentRating = [...bands.entries()]
        .sort(([a], [b]) => a - b)
        .map(([minRating, totals]) => ({
            minRating,
            maxRating: minRating + OPPONENT_BAND_WIDTH,
            games: totals.games,
            wins: totals.wins,
            losses: totals.games - totals.wins,
            averageMargin: totals.marginTotal / totals.games,
        }));

    return stats;
}
