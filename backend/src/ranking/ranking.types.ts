// interface for elo calculation
import { Format } from '../generated/prisma/client';

export type RoundScore = [number, number];   // [team 1 score, team 2 score]

// Sports with Elo parameters. The app only plays tennis for now, so games have no sport column
export type Sport = 'TENNIS' | 'BADMINTON' | 'PICKLEBALL';

export interface PlayerInfo {
    userId: string;
    team: 1 | 2;
    rating: number;
    gamesPlayed: number;    // rated games played before this one; decides the player's K
}

export interface GameInfo {
    sport: Sport;
    format: Format;
    scores: RoundScore[];
}

export interface RatingChange {
    userId: string;
    ratingBefore: number;
    ratingAfter: number;
}

export interface EloParams {
    kFactor: (gamesPlayed: number) => number;   // K: how much the win/loss result moves ratings
    maxExpectedMargin: number;  // α: cap on the predicted margin of victory
    marginGrowthRate: number;   // β: how fast the predicted margin grows with the rating gap
    marginWeight: number;       // λ: weight of the margin surprise in the update
}
