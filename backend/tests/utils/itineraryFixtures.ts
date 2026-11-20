import type {
  CreateActivityInput,
  CreateItineraryInput,
  CreateTransportationInput,
  Itinerary,
  ItineraryDetails,
} from '../../src/itineraries/itineraryTypes';
import type { ItineraryMap } from '../../src/maps/mapTypes';
import { USER_FIXTURE_ID } from './userFixtures';

export const ITINERARY_FIXTURE_USER_ID = USER_FIXTURE_ID;
export const ITINERARY_FIXTURE_ID = '6705f1000000000000000001';
export const ACTIVITY_FIXTURE_ID = 'activity-1';
export const TRANSPORTATION_FIXTURE_ID = 'transportation-1';

export const ACTIVITY_INPUT: CreateActivityInput = {
  type: 'activity',
  name: 'Museum of Anthropology',
  category: 'art',
  location: '6393 NW Marine Drive, Vancouver, BC',
  startTime: '2027-11-30T17:00:00.000Z',
  endTime: '2027-11-30T18:00:00.000Z',
};

export const TRANSPORTATION_INPUT: CreateTransportationInput = {
  type: 'transportation',
  mode: 'walking',
  startLocation: 'Museum of Anthropology',
  endLocation: 'UBC Nest',
  distanceMeters: 1200,
  startTime: '2027-11-30T18:00:00.000Z',
  endTime: '2027-11-30T18:30:00.000Z',
};

export function buildItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: ITINERARY_FIXTURE_ID,
    ownerId: ITINERARY_FIXTURE_USER_ID,
    name: 'Stored itinerary',
    items: [
      { ...ACTIVITY_INPUT, id: ACTIVITY_FIXTURE_ID },
      { ...TRANSPORTATION_INPUT, id: TRANSPORTATION_FIXTURE_ID },
    ],
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-12T12:00:00.000Z',
    saved: true,
    inRecommendation: false,
    score: {},
    ...overrides,
  };
}

export const BASE_ITINERARY = buildItinerary({ name: 'UBC afternoon' });
export const STORED_ITINERARY = buildItinerary();
export const EMPTY_ITINERARY = buildItinerary({ items: [] });
export const ITINERARY_DETAILS: ItineraryDetails = { name: BASE_ITINERARY.name };

export function buildCachedItineraryMap(
  overrides: Partial<ItineraryMap> = {},
): ItineraryMap {
  return {
    itineraryId: ITINERARY_FIXTURE_ID,
    ownerId: ITINERARY_FIXTURE_USER_ID,
    itineraryUpdatedAt: STORED_ITINERARY.updatedAt,
    markers: [],
    routes: [],
    unmappedActivities: [],
    generatedAt: '2026-10-12T12:00:00.000Z',
    ...overrides,
  };
}

export const CACHED_ITINERARY_MAP = buildCachedItineraryMap();

export const CREATE_ITINERARY_INPUT: CreateItineraryInput = {
  ownerId: ITINERARY_FIXTURE_USER_ID,
  name: 'Mocked database itinerary',
  items: [],
  saved: true,
  inRecommendation: false,
  score: {},
};
