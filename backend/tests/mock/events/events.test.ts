import request from 'supertest';

import type { LiveEventCandidate } from '../../../src/events/eventTypes';
import { createApp } from '../../../src/index';
import type { UserRepository } from '../../../src/users/userRepository';
import type {
  InterestPreference,
  UserPreferences,
} from '../../../src/users/userTypes';
import {
  buildEvent,
  CORE_LATITUDE,
  CORE_LONGITUDE,
  createMockEventRepository,
  FIXED_NOW,
  KEEP_REAL_TIMERS,
} from '../../utils/eventFixtures';

const USER_ID = '6705f0000000000000000001';
const EVENTS_PATH = `/api/v1/users/${USER_ID}/events`;
const VALID_QUERY = { latitude: CORE_LATITUDE, longitude: CORE_LONGITUDE };
const MS_PER_DAY = 86_400_000;

function createUserRepository(): jest.Mocked<UserRepository> {
  return {
    findPreferences: jest.fn(),
    findUser: jest.fn(),
    updateUser: jest.fn(),
  };
}

function preferencesFor(interest: InterestPreference): UserPreferences {
  return {
    transportation: { mode: 'transit' },
    budget: 'balanced',
    interest,
  };
}

/** Candidate at the maximum default distance and over 30 days away: scores 60 or 0 by category. */
function farCandidate(
  externalId: string,
  category: string,
): LiveEventCandidate {
  return {
    ...buildEvent({
      externalId,
      category,
      startDateTime: new Date(FIXED_NOW.getTime() + 40 * MS_PER_DAY),
    }),
    distanceKm: 30,
  };
}

function createMockedApp() {
  const userRepository = createUserRepository();
  const eventRepository = createMockEventRepository();
  const app = createApp({ userRepository, eventRepository });
  userRepository.findPreferences.mockResolvedValue(preferencesFor('live_music'));
  eventRepository.findNearbyUpcomingEvents.mockResolvedValue([]);
  return { app, userRepository, eventRepository };
}

beforeEach(() => {
  jest.useFakeTimers({ now: FIXED_NOW, doNotFake: KEEP_REAL_TIMERS as never });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Interface GET /api/v1/users/:userId/events
describe('Mocked: GET /api/v1/users/:userId/events', () => {
  // Input: valid request for an existing user ID.
  // Expected status code: 500
  // Expected output: { error: 'Failed to retrieve events' }
  // Expected behavior: the event repository is never queried after the failure.
  // Mocked behavior: UserRepository.findPreferences rejects with a database error.
  test('returns 500 when the preference lookup fails', async () => {
    const { app, userRepository, eventRepository } = createMockedApp();
    userRepository.findPreferences.mockRejectedValue(new Error('database unavailable'));

    const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to retrieve events' });
    expect(eventRepository.findNearbyUpcomingEvents).not.toHaveBeenCalled();
  });

  // Input: valid request for an existing user ID.
  // Expected status code: 500
  // Expected output: { error: 'Failed to retrieve events' }
  // Expected behavior: the user's preferences were looked up with the requested user ID first.
  // Mocked behavior: EventRepository.findNearbyUpcomingEvents rejects with a database error.
  test('returns 500 when the event query fails', async () => {
    const { app, userRepository, eventRepository } = createMockedApp();
    eventRepository.findNearbyUpcomingEvents.mockRejectedValue(
      new Error('database unavailable'),
    );

    const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to retrieve events' });
    expect(userRepository.findPreferences).toHaveBeenCalledWith(USER_ID);
  });

  // Input: valid request for a user that has no stored preferences.
  // Expected status code: 404
  // Expected output: { error: "User '<id>' was not found." }
  // Expected behavior: the event repository is never queried.
  // Mocked behavior: UserRepository.findPreferences resolves to null.
  test('returns 404 without querying events when the user is missing', async () => {
    const { app, userRepository, eventRepository } = createMockedApp();
    userRepository.findPreferences.mockResolvedValue(null);

    const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: `User '${USER_ID}' was not found.` });
    expect(eventRepository.findNearbyUpcomingEvents).not.toHaveBeenCalled();
  });

  // Input: latitude 91 (out of range).
  // Expected status code: 400
  // Expected output: { error: 'Invalid event query parameters' }
  // Expected behavior: neither repository is called.
  // Mocked behavior: UserRepository and EventRepository are mocked and must not be used.
  test('returns 400 without calling any repository for invalid parameters', async () => {
    const { app, userRepository, eventRepository } = createMockedApp();

    const response = await request(app)
      .get(EVENTS_PATH)
      .query({ ...VALID_QUERY, latitude: 91 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    expect(userRepository.findPreferences).not.toHaveBeenCalled();
    expect(eventRepository.findNearbyUpcomingEvents).not.toHaveBeenCalled();
  });

  // Input: only latitude and longitude.
  // Expected status code: 200
  // Expected output: page 1, limit 20, count 0, and no events.
  // Expected behavior: the repository is queried with the request location, maxDistanceKm 30, and candidateLimit 200.
  // Mocked behavior: EventRepository.findNearbyUpcomingEvents resolves to an empty list.
  test('passes the default distance and candidate limit to the repository', async () => {
    const { app, eventRepository } = createMockedApp();

    const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ page: 1, limit: 20, count: 0, events: [] });
    expect(eventRepository.findNearbyUpcomingEvents).toHaveBeenCalledWith({
      longitude: CORE_LONGITUDE,
      latitude: CORE_LATITUDE,
      maxDistanceKm: 30,
      candidateLimit: 200,
    });
  });

  // Input: maxDistanceKm=12.5, page=2, limit=5.
  // Expected status code: 200
  // Expected output: page 2 and limit 5 are echoed in the response.
  // Expected behavior: the repository is queried with maxDistanceKm 12.5.
  // Mocked behavior: EventRepository.findNearbyUpcomingEvents resolves to an empty list.
  test('passes explicit query parameters through to the repository and response', async () => {
    const { app, eventRepository } = createMockedApp();

    const response = await request(app)
      .get(EVENTS_PATH)
      .query({ ...VALID_QUERY, maxDistanceKm: 12.5, page: 2, limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 2, limit: 5, count: 0 });
    expect(eventRepository.findNearbyUpcomingEvents).toHaveBeenCalledWith({
      longitude: CORE_LONGITUDE,
      latitude: CORE_LATITUDE,
      maxDistanceKm: 12.5,
      candidateLimit: 200,
    });
  });

  // Input: a user with each supported interest, and one candidate inside and one outside its category.
  // Expected status code: 200
  // Expected output: only the candidate in the mapped category, with recommendationScore 60.
  // Expected behavior: food/markets -> Miscellaneous, art -> Arts & Theatre, outdoors/gaming -> Sports, live_music -> Music.
  // Mocked behavior: UserRepository.findPreferences returns the interest; EventRepository returns two candidates at the maximum distance and over 30 days away.
  test.each([
    ['food', 'Miscellaneous'],
    ['art', 'Arts & Theatre'],
    ['outdoors', 'Sports'],
    ['markets', 'Miscellaneous'],
    ['live_music', 'Music'],
    ['gaming', 'Sports'],
  ] as Array<[InterestPreference, string]>)(
    'maps the %s interest to the %s category',
    async (interest, category) => {
      const { app, userRepository, eventRepository } = createMockedApp();
      userRepository.findPreferences.mockResolvedValue(preferencesFor(interest));
      eventRepository.findNearbyUpcomingEvents.mockResolvedValue([
        farCandidate('matching', category),
        farCandidate('other', 'Film'),
      ]);

      const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0]).toMatchObject({
        id: 'matching',
        recommendationScore: 60,
      });
    },
  );

  // Input: a live_music user and a candidate whose category is 'MUSIC'.
  // Expected status code: 200
  // Expected output: the candidate is returned with recommendationScore 60.
  // Expected behavior: category comparison ignores case.
  // Mocked behavior: EventRepository returns a candidate with an upper-case category.
  test('matches the category without regard to case', async () => {
    const { app, eventRepository } = createMockedApp();
    eventRepository.findNearbyUpcomingEvents.mockResolvedValue([
      farCandidate('upper-case', 'MUSIC'),
    ]);

    const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].recommendationScore).toBe(60);
  });

  // Input: valid request.
  // Expected status code: 200
  // Expected output: only the public event fields, with externalId exposed as id.
  // Expected behavior: _id, lastSyncedAt, location, and externalId are not in the response.
  // Mocked behavior: EventRepository returns a candidate that includes _id, lastSyncedAt, and location.
  test('does not expose internal fields from the repository', async () => {
    const { app, eventRepository } = createMockedApp();
    const candidate = {
      ...farCandidate('exposed-id', 'Music'),
      _id: 'internal-id',
    };
    eventRepository.findNearbyUpcomingEvents.mockResolvedValue([candidate]);

    const response = await request(app).get(EVENTS_PATH).query(VALID_QUERY);

    expect(Object.keys(response.body.events[0]).sort()).toEqual([
      'category',
      'city',
      'currency',
      'description',
      'distanceKm',
      'endDateTime',
      'id',
      'imageUrl',
      'priceMax',
      'priceMin',
      'recommendationScore',
      'startDateTime',
      'ticketUrl',
      'title',
      'venueName',
    ]);
    expect(response.body.events[0].id).toBe('exposed-id');
  });
});
