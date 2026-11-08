import { EventService } from '../../../src/events/eventService';
import type { LiveEventCandidate } from '../../../src/events/eventTypes';
import { UserNotFoundError } from '../../../src/users/userErrors';
import type { UserRepository } from '../../../src/users/userRepository';
import {
  buildEvent,
  CORE_LATITUDE,
  CORE_LONGITUDE,
  createMockEventRepository,
  FIXED_NOW,
  KEEP_REAL_TIMERS,
} from '../../utils/eventFixtures';

const USER_ID = '6705f0000000000000000001';
const MS_PER_DAY = 86_400_000;
const OPTIONS = { longitude: CORE_LONGITUDE, latitude: CORE_LATITUDE, maxDistanceKm: 30 };

function setUpService(interest: 'live_music' | 'outdoors' = 'live_music') {
  const userRepository: jest.Mocked<UserRepository> = {
    findPreferences: jest.fn(),
    findUser: jest.fn(),
    updateUser: jest.fn(),
  };
  const eventRepository = createMockEventRepository();
  userRepository.findPreferences.mockResolvedValue({
    transportation: { mode: 'transit' },
    budget: 'balanced',
    interest,
  });
  eventRepository.findNearbyUpcomingEvents.mockResolvedValue([]);
  return {
    service: new EventService(eventRepository, userRepository),
    userRepository,
    eventRepository,
  };
}

function candidate(
  externalId: string,
  distanceKm: number,
  daysUntil: number,
  category = 'Music',
): LiveEventCandidate {
  return {
    ...buildEvent({
      externalId,
      category,
      startDateTime: new Date(FIXED_NOW.getTime() + daysUntil * MS_PER_DAY),
    }),
    distanceKm,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: FIXED_NOW, doNotFake: KEEP_REAL_TIMERS as never });
});

afterEach(() => {
  jest.useRealTimers();
});

// Supporting tests for EventService.getRecommendedEvents (not an HTTP interface).
describe('Mocked: EventService.getRecommendedEvents', () => {
  // Input: a user ID that has no stored preferences.
  // Expected output: a rejection with UserNotFoundError.
  // Expected behavior: events are never queried.
  // Mocked behavior: UserRepository.findPreferences resolves to null.
  test('rejects a missing user without querying events', async () => {
    const { service, userRepository, eventRepository } = setUpService();
    userRepository.findPreferences.mockResolvedValue(null);

    await expect(service.getRecommendedEvents(USER_ID, OPTIONS)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );

    expect(userRepository.findPreferences).toHaveBeenCalledWith(USER_ID);
    expect(eventRepository.findNearbyUpcomingEvents).not.toHaveBeenCalled();
  });

  // Input: location, a 12.5 km maximum distance, and no explicit candidate limit.
  // Expected output: an empty list.
  // Expected behavior: the repository receives the location, distance, and a candidate limit of 200.
  // Mocked behavior: EventRepository.findNearbyUpcomingEvents resolves to an empty list.
  test('queries candidates with the request location and a limit of 200', async () => {
    const { service, eventRepository } = setUpService();

    await service.getRecommendedEvents(USER_ID, { ...OPTIONS, maxDistanceKm: 12.5 });

    expect(eventRepository.findNearbyUpcomingEvents).toHaveBeenCalledWith({
      longitude: CORE_LONGITUDE,
      latitude: CORE_LATITUDE,
      maxDistanceKm: 12.5,
      candidateLimit: 200,
    });
  });

  // Input: candidates at known distances and times for a live_music user, with a 30 km maximum.
  // Expected output: the exact rounded score for each candidate.
  // Expected behavior: score = round(category 60 or 0 + distance 25 * (1 - d / max) + time 15 * (1 - days / 30)).
  // Mocked behavior: EventRepository returns the candidates; Date is frozen.
  test.each([
    ['matching, co-located, starting now', candidate('a', 0, 0), 100],
    ['matching, co-located, 5 days away', candidate('a', 0, 5), 98],
    ['matching, at the maximum distance, 15 days away (67.5 rounds up)', candidate('a', 30, 15), 68],
    ['matching, midway, 15 days away', candidate('a', 15, 15), 80],
    ['matching, 30 days away', candidate('a', 30, 30), 60],
    ['matching, more than 30 days away (time score 0)', candidate('a', 30, 45), 60],
    ['matching, already started (days clamp to 0)', candidate('a', 30, -2), 75],
    ['matching, beyond the maximum distance (distance score 0)', candidate('a', 45, 30), 60],
    ['non-matching, co-located, starting now', candidate('a', 0, 0, 'Sports'), 40],
  ])('scores a %s candidate as %i', async (_label, event, expectedScore) => {
    const { service, eventRepository } = setUpService();
    eventRepository.findNearbyUpcomingEvents.mockResolvedValue([event]);

    const result = await service.getRecommendedEvents(USER_ID, OPTIONS);

    expect(result.map((item) => item.recommendationScore)).toEqual([expectedScore]);
  });

  // Input: non-matching co-located candidates scoring 39, 40, and the highest possible non-matching score.
  // Expected output: the candidates scoring 39 is excluded; 40 is included.
  // Expected behavior: only scores of 40 or higher are returned.
  // Mocked behavior: EventRepository returns the candidates; Date is frozen.
  test('excludes a score of 39 and includes a score of 40', async () => {
    const { service, eventRepository } = setUpService();
    eventRepository.findNearbyUpcomingEvents.mockResolvedValue([
      candidate('score-39', 0, 2, 'Sports'),
      candidate('score-40', 0, 0, 'Sports'),
    ]);

    const result = await service.getRecommendedEvents(USER_ID, OPTIONS);

    expect(result.map((item) => item.externalId)).toEqual(['score-40']);
  });

  // Input: 45 matching candidates with falling scores; page 2 with limit 20, then the defaults.
  // Expected output: page 2 holds results 20 to 39; the defaults give page 1 with 20 events.
  // Expected behavior: pagination follows scoring and sorting; defaults are page 1 and limit 20.
  // Mocked behavior: EventRepository returns the candidates.
  test('paginates after sorting, with defaults of page 1 and limit 20', async () => {
    const { service, eventRepository } = setUpService();
    eventRepository.findNearbyUpcomingEvents.mockResolvedValue(
      Array.from({ length: 45 }, (_, n) => candidate(`event-${n}`, 0, (1 + n) / 24)),
    );

    const pageTwo = await service.getRecommendedEvents(USER_ID, { ...OPTIONS, page: 2, limit: 20 });
    const defaults = await service.getRecommendedEvents(USER_ID, OPTIONS);

    expect(pageTwo.map((item) => item.externalId)).toEqual(
      Array.from({ length: 20 }, (_, n) => `event-${20 + n}`),
    );
    expect(defaults).toHaveLength(20);
    expect(defaults[0]?.externalId).toBe('event-0');
  });

  // Input: page 0, limit 0, page -1, limit -1, maxDistanceKm 0, and maxDistanceKm -1.
  // Expected output: a rejection with an invalid-options error.
  // Expected behavior: neither repository is called.
  // Mocked behavior: both repositories are mocked and must not be used.
  test.each([
    ['page 0', { page: 0 }],
    ['page -1', { page: -1 }],
    ['limit 0', { limit: 0 }],
    ['limit -1', { limit: -1 }],
    ['maxDistanceKm 0', { maxDistanceKm: 0 }],
    ['maxDistanceKm -1', { maxDistanceKm: -1 }],
  ])('rejects %s before querying any repository', async (_label, invalid) => {
    const { service, userRepository, eventRepository } = setUpService();

    await expect(
      service.getRecommendedEvents(USER_ID, { ...OPTIONS, ...invalid }),
    ).rejects.toThrow('Invalid event recommendation options');

    expect(userRepository.findPreferences).not.toHaveBeenCalled();
    expect(eventRepository.findNearbyUpcomingEvents).not.toHaveBeenCalled();
  });
});
