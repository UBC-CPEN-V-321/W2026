// Pure Elo math and calculations
import { Format } from '../generated/prisma/client'
import { EloParams, GameInfo, PlayerInfo, RatingChange, Sport } from './ranking.types'

// Pickleball players get double K for this many games, so new players reach their real rating faster
export const PICKLEBALL_PLACEMENT_GAMES = 8;

/**
 * Elo parameters per sport. A round is a set in tennis and a game in badminton and pickleball.
 * K depends on how many rated games the player has played in that sport.
 *
 * @param sport - The sport being rated
 * @returns The sport's K-factor function and margin parameters
 */
function paramsFor(sport: Sport): EloParams {
    switch (sport) {
        // FiveThirtyEight / Kovalchik (2016): K starts near 131 and decays as the player plays more
        case 'TENNIS':
            return {
                kFactor: (gamesPlayed) => 250 / (gamesPlayed + 5) ** 0.4,
                maxExpectedMargin: 6, marginGrowthRate: 0.0025, marginWeight: 1.5,
            };
        case 'BADMINTON':
            return {
                kFactor: () => 32,
                maxExpectedMargin: 15, marginGrowthRate: 0.005, marginWeight: 0.5,
            };
        case 'PICKLEBALL':
            return {
                kFactor: (gamesPlayed) => (gamesPlayed < PICKLEBALL_PLACEMENT_GAMES ? 120 : 60),
                maxExpectedMargin: 8, marginGrowthRate: 0.0025, marginWeight: 1.0,
            };
    }
}

// determine how many points correspond to a given difference in skill
// 400 means the stronger side has 10-to-1 odds of winning (standard Elo scale)
const ELO_SCALE = 400;

// The parts of side A's rating update that are the same for every player in the game.
// Each player's update is their own K * outcomeSurprise + marginTerm.
interface RatingUpdateParts {
    outcomeSurprise: number;    // S_A - E_A
    marginTerm: number;         // λ * ΔMOV
}

/**
 * Calculates a player's K-factor: how much the win/loss result moves their rating.
 *
 * @param sport - The sport being rated
 * @param gamesPlayed - Rated games the player has played in that sport before this one
 * @returns The player's K-factor
 * @throws If gamesPlayed is not a non-negative integer
 */
export function calculateKFactor(sport: Sport, gamesPlayed: number): number {
    if (!Number.isInteger(gamesPlayed) || gamesPlayed < 0) {
        throw new Error(`Games played must be a non-negative integer (${gamesPlayed})`);
    }
    return paramsFor(sport).kFactor(gamesPlayed);
}

/**
 * Calculates the probability that player A beats player B.
 *
 * @param playerARating - Rating of player (or team) A
 * @param playerBRating - Rating of player (or team) B
 * @returns A value between 0 and 1, where 0.5 means an even match
 */
function calculateExpectedOutcome(
    playerARating: number,
    playerBRating: number,
): number {
    const ratingGap = playerARating - playerBRating;
    return 1 / ( 1 + 10 ** ((-ratingGap)/ELO_SCALE) );
}

/**
 * Calculates the expected margin of victory for player A over player B.
 * The margin grows with the rating gap but levels off at maxExpectedMargin,
 * so huge rating gaps don't predict unrealistic blowouts.
 *
 * @param playerARating - Rating of player (or team) A
 * @param playerBRating - Rating of player (or team) B
 * @param params - Elo parameters of the sport
 * @returns Expected points A wins by, between -maxExpectedMargin and +maxExpectedMargin
 *          (negative means B is expected to win)
 */
function calculateExpectedMargin(
    playerARating: number,
    playerBRating: number,
    params: EloParams,
): number {
    const ratingGap = playerARating - playerBRating;
    const { maxExpectedMargin, marginGrowthRate } = params;

    return maxExpectedMargin * Math.tanh(marginGrowthRate * ratingGap);
}

/**
 * Calculates how side A's rating changes after a game, combining the
 * win/loss result with how much the margin of victory beat expectations.
 * A player on side A gains K * outcomeSurprise + marginTerm using their own K;
 * a player on side B loses the same expression using their own K.
 *
 * @param playerARating - Rating of player (or team average) A, who must be team 1
 * @param playerBRating - Rating of player (or team average) B, who must be team 2
 * @param game - Sport, format and round scores
 * @returns The win/loss surprise and the margin term of A's update
 */
function calculateRatingUpdate(
    playerARating: number,
    playerBRating: number,
    game: GameInfo,
): RatingUpdateParts {

    const params = paramsFor(game.sport);
    const expectedOutcome = calculateExpectedOutcome(playerARating, playerBRating);
    const expectedMargin = calculateExpectedMargin(playerARating, playerBRating, params);

    let teamATotal = 0;
    let teamBTotal = 0;

    let teamAWins = 0;
    let teamBWins = 0;

    for (const round of game.scores) {
        const teamAScore = round[0];
        const teamBScore = round[1];

        for (const value of [teamAScore, teamBScore]) {
            if (!Number.isInteger(value) || value < 0) {
                throw new Error(`Round score must be a non-negative integer (${teamAScore}-${teamBScore})`);
            }
        }

        if (teamAScore === teamBScore) {
            throw new Error(`Round cannot be tied (${teamAScore}-${teamBScore})`);
        }

        if(teamAScore > teamBScore){
            teamAWins ++;
        } else {
            teamBWins ++;
        }

        teamATotal += teamAScore;
        teamBTotal += teamBScore;
    }

    if (teamAWins === teamBWins) {
        throw new Error(`Match has no winner (${teamAWins}-${teamBWins} in rounds)`);
    }

    const margin = teamATotal - teamBTotal;
    const actualOutcome = teamAWins > teamBWins ? 1 : 0;   // S_A
    const marginSurprise = margin - expectedMargin;

    return {
        outcomeSurprise: actualOutcome - expectedOutcome,
        marginTerm: params.marginWeight * marginSurprise,
    };
}

/**
 * Applies the rating update to one player.
 *
 * @param player - The player being updated
 * @param update - Side A's update parts
 * @param sign - 1 for a player on side A (team 1), -1 for side B (team 2)
 * @param share - The share of the update the player receives (1 in singles, 1/2 in doubles)
 * @param game - The game, for its sport
 * @returns The player's rating before and after the game
 */
function applyUpdate(
    player: PlayerInfo,
    update: RatingUpdateParts,
    sign: 1 | -1,
    share: number,
    game: GameInfo,
): RatingChange {
    const kFactor = calculateKFactor(game.sport, player.gamesPlayed);
    const change = kFactor * update.outcomeSurprise + update.marginTerm;
    return {
        userId: player.userId,
        ratingBefore: player.rating,
        ratingAfter: player.rating + sign * share * change,
    };
}

/**
 * Calculates the new rating for every player in a finished game.
 * Each player's K comes from their own number of rated games in the sport, so
 * the game is only zero-sum when every player has the same K.
 * In doubles, each team is rated by its players' average rating and each
 * player receives half of the team's rating change, calculated with their own K.
 *
 * @param players - Players in any order. Singles: one player on each of team 1 and team 2.
 *                  Doubles: two players on each team.
 * @param game - Sport, format and round scores of the game
 * @returns One RatingChange per player: team 1 players first, then team 2
 * @throws If the player count or team split doesn't match the format, a userId
 *         appears more than once, a rating isn't finite, a games-played count
 *         isn't a non-negative integer, or the scores are empty, contain an
 *         invalid or tied round, or have no winner
 */
export function calculateELOChange(
    players: PlayerInfo[],
    game: GameInfo,
): RatingChange[] {

    if(game.scores.length === 0){
        throw new Error(`Game has no round score information`);
    }

    // check for duplicated player
    if (new Set(players.map(player => player.userId)).size !== players.length) {
        throw new Error('Players must have unique userId values');
    }

    // check every player rating is finite
    if (!players.every(p => Number.isFinite(p.rating))) {
        throw new Error('Player rating not finite');
    }

    // check every games-played count before any rating is calculated
    for (const player of players) {
        calculateKFactor(game.sport, player.gamesPlayed);
    }

    switch (game.format) {
        case Format.SINGLES: {
            if (players.length !== 2) {
                throw new Error(`Singles game needs exactly 2 players, got ${players.length}`);
            }

            const [playerA] = players.filter(p => p.team === 1);
            const [playerB] = players.filter(p => p.team === 2);

            if (!playerA || !playerB) {
                throw new Error('Singles game needs one player on each team');
            }

            const update = calculateRatingUpdate(playerA.rating, playerB.rating, game);
            return [
                applyUpdate(playerA, update, 1, 1, game),
                applyUpdate(playerB, update, -1, 1, game),
            ]

        }
        case Format.DOUBLES: {
            if (players.length !== 4) {
                throw new Error(`Doubles game needs exactly 4 players, got ${players.length}`);
            }

            const [playerA, playerB] = players.filter(p => p.team === 1);
            const [playerC, playerD] = players.filter(p => p.team === 2);

            if (!playerA || !playerB || !playerC || !playerD) {
                throw new Error('Doubles game needs two players on each team');
            }
            // calculate elo average
            const team0Avg = (playerA.rating + playerB.rating)/2;
            const team1Avg = (playerC.rating + playerD.rating)/2;

            // calculate Team ELO changes
            const teamUpdate = calculateRatingUpdate(
                team0Avg, team1Avg, game
            )

            // each player receives half of the team change, using their own K
            return [
                applyUpdate(playerA, teamUpdate, 1, 0.5, game),
                applyUpdate(playerB, teamUpdate, 1, 0.5, game),
                applyUpdate(playerC, teamUpdate, -1, 0.5, game),
                applyUpdate(playerD, teamUpdate, -1, 0.5, game),
            ]
        }
    }
}
