import type { CreateItineraryInput, Itinerary } from '../itineraries/itineraryTypes';
import type { InterestPreference, UserPreferences } from '../users/userTypes';

export interface RecommendationProfile {
  start_location: string;
  preferences: UserPreferences;
}

export type GeneratedItineraryInput = Omit<
  CreateItineraryInput,
  'ownerId' | 'saved' | 'inRecommendation' | 'score'
>;

export type RecommendedItineraryInput = GeneratedItineraryInput &
  Pick<CreateItineraryInput, 'score'>;

export type RecommendationSet = Itinerary[];

export interface ItineraryGenerator {
  generateItineraries(profile: RecommendationProfile): Promise<string>;
}

export interface ItineraryRanker {
  rankItineraries(
    itineraries: GeneratedItineraryInput[],
    interest: InterestPreference,
  ): Promise<RecommendedItineraryInput[]>;
}

export interface SoclaasResponsesApiResponse {
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
  output_text?: string;
  output?: {
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
  error?: string | { message?: string };
}
