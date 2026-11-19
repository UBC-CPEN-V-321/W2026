import 'dotenv/config';

import * as os from 'node:os';

import type { Express } from 'express';
import { Db, MongoClient, ObjectId } from 'mongodb';
import type { Response, Test } from 'supertest';

import { EventDao } from '../../../src/events/eventDao';
import type { LiveEvent } from '../../../src/events/eventTypes';
import { createApp as createBackendApp, type AppDependencies } from '../../../src/index';
import { UserDao } from '../../../src/users/userDao';
import { authenticatedAgent, MongoTestSessions } from '../../support/authTestUtils';
import {
  buildEvent,
  buildUserDocument,
  CORE_LATITUDE,
  CORE_LONGITUDE,
  FIXED_NOW,
  KEEP_REAL_TIMERS,
} from '../../utils/eventFixtures';

jest.setTimeout(30_000);

const USER_ID = new ObjectId();
const MISSING_USER_ID = new ObjectId();
// A fixed name, reused every run, so test databases never pile up on the shared cluster.
const DATABASE_NAME = 'eubc_events_api';
const EVENTS_PATH = `/api/v1/users/${USER_ID.toHexString()}/events`;

// MongoDB's spherical queries use an Earth radius of 6378.1 km.
const KM_PER_DEGREE_LATITUDE = (6378.1 * Math.PI) / 180;
const MS_PER_DAY = 86_400_000;
const VALID_QUERY: Record<string, string> = {
  latitude: String(CORE_LATITUDE),
  longitude: String(CORE_LONGITUDE),
};

let client: MongoClient;
let database: Db;
let app: Express;
let testSessions: MongoTestSessions;

function daysFromNow(days: number): Date {
  return new Date(FIXED_NOW.getTime() + days * MS_PER_DAY);
}

/** Builds an event placed the given distance due north of the request location. */
function eventNorthOfUser(
  externalId: string,
  kmNorth: number,
  overrides: Partial<LiveEvent> = {},
): LiveEvent {
  return buildEvent({
    externalId,
    location: {
      type: 'Point',
      coordinates: [CORE_LONGITUDE, CORE_LATITUDE + kmNorth / KM_PER_DEGREE_LATITUDE],
    },
    ...overrides,
  });
}

async function seedEvents(events: LiveEvent[]): Promise<void> {
  await database.collection('liveevents').insertMany(events);
}

function createApp(dependencies: Omit<AppDependencies, 'sessionService'>): Express {
  return createBackendApp({ ...dependencies, sessionService: testSessions.service });
}

const request = (expressApp: Express) => authenticatedAgent(
  expressApp,
  (userId) =>
    testSessions.tokenFor(userId) ?? testSessions.tokenFor(USER_ID.toHexString()),
);

function getEvents(query: Record<string, string | undefined> = {}): Test {
  const merged = { ...VALID_QUERY, ...query };
  const definedQuery = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  );
  return request(app).get(EVENTS_PATH).query(definedQuery);
}

function eventIds(response: Response): string[] {
  return (response.body.events as { id: string }[]).map((event) => event.id);
}

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined || uri.trim() === '') {
    throw new Error('MONGODB_URI is required for no-mock tests.');
  }

  client = new MongoClient(uri, {
    runtimeAdapters: { os },
    serverSelectionTimeoutMS: 10_000,
  });
  database = client.db(DATABASE_NAME);
  testSessions = new MongoTestSessions(database);
  const eventDao = new EventDao(database);
  app = createApp({
    eventRepository: eventDao,
    userRepository: new UserDao(database),
  });
  await client.connect();
  await eventDao.createIndexes();
});

beforeEach(async () => {
  await database.collection('liveevents').deleteMany({});
  await database.collection('users').deleteMany({});
  await database.collection('users').insertOne(buildUserDocument('live_music', USER_ID));
  await testSessions.reset([USER_ID.toHexString(), MISSING_USER_ID.toHexString()]);
  jest.useFakeTimers({ now: FIXED_NOW, doNotFake: KEEP_REAL_TIMERS as never });
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(async () => {
  try {
    await database.collection('liveevents').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('sessions').deleteMany({});
  } finally {
    await client.close();
  }
});

// Interface GET /api/v1/users/:userId/events
describe('Unmocked: GET /api/v1/users/:userId/events', () => {
  // Input: user with the live_music interest; one stored Music event at the request location.
  // Expected status code: 200
  // Expected output: page, limit, count, and an event with the public fields only.
  // Expected behavior: the real service and DAOs read the user and event from MongoDB.
  test('returns the recommended event with its public fields only', async () => {
    await seedEvents([buildEvent()]);

    const response = await getEvents();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, limit: 20, count: 1 });
    const { distanceKm, ...event } = response.body.events[0];
    expect(distanceKm).toBeCloseTo(0, 5);
    expect(event).toEqual({
      id: 'tm-event-1',
      title: 'Evening Concert',
      description: 'Live music in Vancouver.',
      imageUrl: 'https://example.com/event.jpg',
      startDateTime: '2026-11-10T20:00:00.000Z',
      endDateTime: '2026-11-10T22:00:00.000Z',
      venueName: 'Orpheum Theatre',
      city: 'Vancouver',
      category: 'Music',
      ticketUrl: 'https://example.com/tickets',
      priceMin: 30,
      priceMax: 60,
      currency: 'CAD',
      recommendationScore: 98,
    });
  });

  // Input: stored event with no description, end time, or price fields.
  // Expected status code: 200
  // Expected output: the event is returned without the optional keys.
  // Expected behavior: missing optional fields do not exclude the event.
  test('omits optional fields that are absent from the stored event', async () => {
    const event = buildEvent();
    delete event.description;
    delete event.endDateTime;
    delete event.priceMin;
    delete event.priceMax;
    delete event.currency;
    await seedEvents([event]);

    const response = await getEvents();

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    for (const key of ['description', 'endDateTime', 'priceMin', 'priceMax', 'currency']) {
      expect(response.body.events[0]).not.toHaveProperty(key);
    }
  });

  // Input: only latitude and longitude; events 29 km and 31 km north of the user.
  // Expected status code: 200
  // Expected output: page 1, limit 20, and only the 29 km event.
  // Expected behavior: the defaults maxDistanceKm=30, page=1, and limit=20 are applied.
  test('applies the default distance, page, and limit', async () => {
    await seedEvents([
      eventNorthOfUser('within-default', 29),
      eventNorthOfUser('beyond-default', 31),
    ]);

    const response = await getEvents();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, limit: 20, count: 1 });
    expect(eventIds(response)).toEqual(['within-default']);
  });

  // Input: one query where latitude is missing and one where longitude is missing.
  // Expected status code: 400
  // Expected output: { error: 'Invalid event query parameters' }
  // Expected behavior: the request is rejected before any recommendation is made.
  test.each(['latitude', 'longitude'])('rejects a missing %s', async (name) => {
    const response = await getEvents({ [name]: undefined });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid event query parameters' });
  });

  // Input: one non-numeric value for each numeric query parameter.
  // Expected status code: 400
  // Expected output: { error: 'Invalid event query parameters' }
  // Expected behavior: the request is rejected before any recommendation is made.
  test.each(['latitude', 'longitude', 'page', 'limit', 'maxDistanceKm'])(
    'rejects a non-numeric %s',
    async (name) => {
      const response = await getEvents({ [name]: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    },
  );

  // Input: latitude just below -90, at -90, at 90, and just above 90.
  // Expected status code: 400 outside the range, 200 on the boundaries.
  // Expected output: the error body outside the range; an empty list on the boundaries.
  // Expected behavior: only coordinates within -90 through 90 are accepted.
  test.each([
    ['-90.01', 400],
    ['-90', 200],
    ['90', 200],
    ['90.01', 400],
  ])('latitude %s returns %i', async (latitude, status) => {
    const response = await getEvents({ latitude });

    expect(response.status).toBe(status);
    if (status === 400) {
      expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    } else {
      expect(response.body.count).toBe(0);
    }
  });

  // Input: longitude just below -180, at -180, at 180, and just above 180.
  // Expected status code: 400 outside the range, 200 on the boundaries.
  // Expected output: the error body outside the range; an empty list on the boundaries.
  // Expected behavior: only coordinates within -180 through 180 are accepted.
  test.each([
    ['-180.01', 400],
    ['-180', 200],
    ['180', 200],
    ['180.01', 400],
  ])('longitude %s returns %i', async (longitude, status) => {
    const response = await getEvents({ longitude });

    expect(response.status).toBe(status);
    if (status === 400) {
      expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    } else {
      expect(response.body.count).toBe(0);
    }
  });

  // Input: page 0, page 1.5, and page 1.
  // Expected status code: 400 for 0 and 1.5; 200 for 1.
  // Expected output: the error body for invalid pages; page 1 for the valid page.
  // Expected behavior: page must be a positive integer.
  test.each([
    ['0', 400],
    ['1.5', 400],
    ['1', 200],
  ])('page %s returns %i', async (page, status) => {
    const response = await getEvents({ page });

    expect(response.status).toBe(status);
    if (status === 200) {
      expect(response.body.page).toBe(1);
    } else {
      expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    }
  });

  // Input: limit 0, 1, 100, and 101.
  // Expected status code: 400 for 0 and 101; 200 for 1 and 100.
  // Expected output: the error body for invalid limits; the requested limit otherwise.
  // Expected behavior: limit must be an integer from 1 through 100.
  test.each([
    ['0', 400],
    ['1', 200],
    ['100', 200],
    ['101', 400],
  ])('limit %s returns %i', async (limit, status) => {
    const response = await getEvents({ limit });

    expect(response.status).toBe(status);
    if (status === 200) {
      expect(response.body.limit).toBe(Number(limit));
    } else {
      expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    }
  });

  // Input: maxDistanceKm 0 and 0.001.
  // Expected status code: 400 for 0; 200 for 0.001.
  // Expected output: the error body for 0; an empty list for 0.001.
  // Expected behavior: maxDistanceKm must be greater than zero.
  test.each([
    ['0', 400],
    ['0.001', 200],
  ])('maxDistanceKm %s returns %i', async (maxDistanceKm, status) => {
    const response = await getEvents({ maxDistanceKm });

    expect(response.status).toBe(status);
    if (status === 400) {
      expect(response.body).toEqual({ error: 'Invalid event query parameters' });
    } else {
      expect(response.body.count).toBe(0);
    }
  });

  // Input: a well-formed user ID that has no user document.
  // Expected status code: 404
  // Expected output: { error: "User '<id>' was not found." }
  // Expected behavior: the real UserDao finds no user, so no events are returned.
  test('returns 404 for a user that does not exist', async () => {
    await seedEvents([buildEvent()]);

    const response = await request(app)
      .get(`/api/v1/users/${MISSING_USER_ID.toHexString()}/events`)
      .query(VALID_QUERY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: `User '${MISSING_USER_ID.toHexString()}' was not found.`,
    });
  });

  // Input: a user ID that is not a valid ObjectId.
  // Expected status code: 403 FORBIDDEN
  // Expected behavior: no session can belong to a malformed user ID, so the ownership check rejects it
  // before the events route runs.
  test('returns 403 for a malformed user ID', async () => {
    const response = await request(app)
      .get('/api/v1/users/not-an-object-id/events')
      .query(VALID_QUERY);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  // Input: live_music user; a Music event at the user's location starting in 5 days.
  // Expected status code: 200
  // Expected output: distanceKm 0 and recommendationScore 98.
  // Expected behavior: score = round(60 category + 25 distance + 12.5 time) at the frozen time.
  test('scores a matching, co-located event 5 days away as 98', async () => {
    await seedEvents([buildEvent()]);

    const response = await getEvents();

    expect(response.body.events[0].recommendationScore).toBe(98);
  });

  // Input: live_music user; a Sports event at the user's location starting in 2 days.
  // Expected status code: 200
  // Expected output: an empty list, because the score is 25 + 14 = 39.
  // Expected behavior: a score of 39 is below the threshold of 40.
  test('excludes a non-matching event with a score of 39', async () => {
    await seedEvents([buildEvent({ category: 'Sports', startDateTime: daysFromNow(2) })]);

    const response = await getEvents();

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
  });

  // Input: live_music user; a Sports event at the user's location starting at the current time.
  // Expected status code: 200
  // Expected output: the event with recommendationScore 40, because the score is 25 + 15.
  // Expected behavior: a score of exactly 40 meets the threshold; an event starting now is upcoming.
  test('includes a non-matching event with a score of exactly 40', async () => {
    await seedEvents([buildEvent({ category: 'Sports', startDateTime: daysFromNow(0) })]);

    const response = await getEvents();

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.events[0].recommendationScore).toBe(40);
  });

  // Input: matching events with scores 98, 85, 85 (different starts), and 75, stored out of order.
  // Expected status code: 200
  // Expected output: events ordered 98, 85 (earlier start), 85 (later start), 75.
  // Expected behavior: sort by score descending, then start time ascending.
  test('sorts by score, then by earlier start time on equal scores', async () => {
    await seedEvents([
      eventNorthOfUser('tie-later', 0, { startDateTime: daysFromNow(41) }),
      eventNorthOfUser('twelve-km', 12, { startDateTime: daysFromNow(40) }),
      eventNorthOfUser('tie-earlier', 0, { startDateTime: daysFromNow(40) }),
      eventNorthOfUser('best', 0, { startDateTime: daysFromNow(5) }),
    ]);

    const response = await getEvents();

    expect(eventIds(response)).toEqual(['best', 'tie-earlier', 'tie-later', 'twelve-km']);
    expect(
      response.body.events.map((event: { recommendationScore: number }) => event.recommendationScore),
    ).toEqual([98, 85, 85, 75]);
  });

  // Input: matching events 1 km, 15 km, and 29 km from the user, and one 31 km away.
  // Expected status code: 200
  // Expected output: the first three events with distanceKm in kilometres; not the 31 km event.
  // Expected behavior: only events within maxDistanceKm (default 30) are returned.
  test('returns events inside the distance limit and excludes events outside it', async () => {
    await seedEvents([
      eventNorthOfUser('near', 1),
      eventNorthOfUser('midway', 15),
      eventNorthOfUser('edge', 29),
      eventNorthOfUser('outside', 31),
    ]);

    const response = await getEvents();

    const body = response.body as { events: { id: string; distanceKm: number }[] };
    const distances = new Map<string, number>(
      body.events.map((event): [string, number] => [event.id, event.distanceKm]),
    );
    expect([...distances.keys()].sort()).toEqual(['edge', 'midway', 'near']);
    expect(distances.get('near')).toBeCloseTo(1, 2);
    expect(distances.get('midway')).toBeCloseTo(15, 2);
    expect(distances.get('edge')).toBeCloseTo(29, 2);
  });

  // Input: a Music event that started one second ago and one starting in 40 days.
  // Expected status code: 200
  // Expected output: only the 40-day event, with recommendationScore 85 (time score 0).
  // Expected behavior: started events are excluded; distant dates still qualify when the category matches.
  test('excludes events that already started and keeps events over 30 days away', async () => {
    await seedEvents([
      buildEvent({
        externalId: 'started',
        startDateTime: new Date(FIXED_NOW.getTime() - 1000),
      }),
      buildEvent({ externalId: 'far-future', startDateTime: daysFromNow(40) }),
    ]);

    const response = await getEvents();

    expect(eventIds(response)).toEqual(['far-future']);
    expect(response.body.events[0].recommendationScore).toBe(85);
  });

  // Input: no stored events.
  // Expected status code: 200
  // Expected output: { page: 1, limit: 20, count: 0, events: [] }
  // Expected behavior: an empty catalogue is a valid, empty result.
  test('returns an empty page when there are no events', async () => {
    const response = await getEvents();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ page: 1, limit: 20, count: 0, events: [] });
  });

  // Input: 3 stored matching events.
  // Expected status code: 200
  // Expected output: count 3 on page 1.
  // Expected behavior: a partial page returns every available event.
  test('returns a partial page of fewer than 20 events', async () => {
    await seedEvents(
      [1, 2, 3].map((n) => eventNorthOfUser(`partial-${n}`, 0, { startDateTime: daysFromNow(n) })),
    );

    const response = await getEvents();

    expect(response.body.count).toBe(3);
  });

  // Input: 20 stored matching events; page 1 and page 2.
  // Expected status code: 200
  // Expected output: count 20 on page 1 and count 0 on page 2.
  // Expected behavior: a full page does not create an extra page.
  test('returns a full page of exactly 20 events and nothing on page 2', async () => {
    await seedEvents(
      Array.from({ length: 20 }, (_, n) =>
        eventNorthOfUser(`full-${n}`, 0, { startDateTime: daysFromNow(1 + n / 24) }),
      ),
    );

    const firstPage = await getEvents({ page: '1' });
    const secondPage = await getEvents({ page: '2' });

    expect(firstPage.body.count).toBe(20);
    expect(secondPage.body.count).toBe(0);
  });

  // Input: 21 stored matching events; pages 1, 2, and 3.
  // Expected status code: 200
  // Expected output: 20 events, then the 21st event alone, then an empty page, with no repeats.
  // Expected behavior: pagination happens after scoring and sorting.
  test('splits 21 events across pages without repeating any event', async () => {
    await seedEvents(
      Array.from({ length: 21 }, (_, n) =>
        eventNorthOfUser(`paged-${n}`, 0, { startDateTime: daysFromNow(1 + n / 24) }),
      ),
    );

    const pageOne = await getEvents({ page: '1' });
    const pageTwo = await getEvents({ page: '2' });
    const pageThree = await getEvents({ page: '3' });

    expect(pageOne.body.count).toBe(20);
    expect(eventIds(pageTwo)).toEqual(['paged-20']);
    expect(pageThree.body.count).toBe(0);
    const allIds = [...eventIds(pageOne), ...eventIds(pageTwo)];
    expect(new Set(allIds).size).toBe(21);
  });
});
