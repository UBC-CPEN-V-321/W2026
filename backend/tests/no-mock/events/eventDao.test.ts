import 'dotenv/config';

import * as os from 'node:os';

import { Collection, Db, MongoClient } from 'mongodb';

import { EventDao } from '../../../src/events/eventDao';
import type { LiveEvent } from '../../../src/events/eventTypes';
import {
  buildEvent,
  CORE_LATITUDE,
  CORE_LONGITUDE,
  FIXED_NOW,
  KEEP_REAL_TIMERS,
} from '../../utils/eventFixtures';

jest.setTimeout(30_000);

// A fixed name, reused every run, so test databases never pile up on the shared cluster.
const DATABASE_NAME = 'eubc_events_dao';
// MongoDB's spherical queries use an Earth radius of 6378.1 km.
const KM_PER_DEGREE_LATITUDE = (6378.1 * Math.PI) / 180;
const NEARBY_QUERY = {
  longitude: CORE_LONGITUDE,
  latitude: CORE_LATITUDE,
  maxDistanceKm: 10,
};

let client: MongoClient;
let database: Db;
let eventDao: EventDao;

function eventNorthOfUser(
  externalId: string,
  kmNorth: number,
  overrides: Partial<LiveEvent> = {},
): LiveEvent {
  return buildEvent({
    externalId,
    startDateTime: new Date(FIXED_NOW.getTime() + 86_400_000),
    location: {
      type: 'Point',
      coordinates: [CORE_LONGITUDE, CORE_LATITUDE + kmNorth / KM_PER_DEGREE_LATITUDE],
    },
    ...overrides,
  });
}

async function storedExternalIds(): Promise<string[]> {
  const documents = await database
    .collection<{ externalId: string }>('liveevents')
    .find({})
    .toArray();
  return documents.map((document) => document.externalId).sort();
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
  eventDao = new EventDao(database);
  await client.connect();
  await eventDao.createIndexes();
});

beforeEach(async () => {
  await database.collection('liveevents').deleteMany({});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

afterAll(async () => {
  try {
    await database.collection('liveevents').deleteMany({});
  } finally {
    await client.close();
  }
});

// Supporting tests for the EventRepository / EventDao interface (not an HTTP interface).
describe('Unmocked: EventDao', () => {
  // Input: createIndexes called a second time on an already indexed collection.
  // Expected output: the collection has the four required indexes.
  // Expected behavior: unique externalId, startDateTime, category + startDateTime, and a 2dsphere location index.
  test('creates the required indexes and can be run again', async () => {
    await eventDao.createIndexes();

    const indexes = await database.collection('liveevents').indexes();
    const isUniqueByKey = new Map<string, boolean>();
    for (const index of indexes) {
      isUniqueByKey.set(JSON.stringify(index.key), index.unique === true);
    }
    expect(isUniqueByKey.get(JSON.stringify({ externalId: 1 }))).toBe(true);
    expect(isUniqueByKey.has(JSON.stringify({ startDateTime: 1 }))).toBe(true);
    expect(isUniqueByKey.has(JSON.stringify({ category: 1, startDateTime: 1 }))).toBe(true);
    expect(isUniqueByKey.has(JSON.stringify({ location: '2dsphere' }))).toBe(true);
  });

  // Input: two events with new external IDs.
  // Expected output: matchedCount 0, modifiedCount 0, upsertedCount 2.
  // Expected behavior: both events are stored as new documents.
  test('inserts events with new external IDs', async () => {
    const result = await eventDao.upsertEvents([
      buildEvent({ externalId: 'new-1' }),
      buildEvent({ externalId: 'new-2' }),
    ]);

    expect(result).toEqual({ matchedCount: 0, modifiedCount: 0, upsertedCount: 2 });
    expect(await storedExternalIds()).toEqual(['new-1', 'new-2']);
  });

  // Input: an event upserted twice; the second version has a new title and no description.
  // Expected output: matchedCount 1, modifiedCount 1, upsertedCount 0 on the second call.
  // Expected behavior: one document remains and it is fully replaced.
  test('replaces an event with an existing external ID without duplicating it', async () => {
    await eventDao.upsertEvents([buildEvent({ externalId: 'same' })]);
    const replacement = buildEvent({ externalId: 'same', title: 'Updated Title' });
    delete replacement.description;

    const result = await eventDao.upsertEvents([replacement]);

    expect(result).toEqual({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 });
    const documents = await database.collection('liveevents').find({}).toArray();
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ externalId: 'same', title: 'Updated Title' });
    expect(documents[0]).not.toHaveProperty('description');
  });

  // Input: an empty event list.
  // Expected output: zero matched, modified, and upserted counts.
  // Expected behavior: no bulk write is issued.
  test('returns zero counts for an empty upsert without writing', async () => {
    const bulkWrite = jest.spyOn(Collection.prototype, 'bulkWrite');

    const result = await eventDao.upsertEvents([]);

    expect(result).toEqual({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  // Input: events starting 1 ms before, exactly at, and 1 ms after the deletion time.
  // Expected output: 1 deleted.
  // Expected behavior: only the event before the boundary is removed.
  test('deletes only events that started before the given time', async () => {
    const boundary = new Date('2026-11-05T20:00:00.000Z');
    await eventDao.upsertEvents([
      buildEvent({ externalId: 'before', startDateTime: new Date(boundary.getTime() - 1) }),
      buildEvent({ externalId: 'at', startDateTime: boundary }),
      buildEvent({ externalId: 'after', startDateTime: new Date(boundary.getTime() + 1) }),
    ]);

    const deleted = await eventDao.deleteExpiredEvents(boundary);

    expect(deleted).toBe(1);
    expect(await storedExternalIds()).toEqual(['after', 'at']);
  });

  // Input: events last synced 1 ms before, exactly at, and 1 ms after the sync start time.
  // Expected output: 1 deleted.
  // Expected behavior: only the event synced before the boundary is removed.
  test('deletes only events not synced since the given time', async () => {
    const boundary = new Date('2026-11-05T20:00:00.000Z');
    await eventDao.upsertEvents([
      buildEvent({ externalId: 'stale', lastSyncedAt: new Date(boundary.getTime() - 1) }),
      buildEvent({ externalId: 'at', lastSyncedAt: boundary }),
      buildEvent({ externalId: 'fresh', lastSyncedAt: new Date(boundary.getTime() + 1) }),
    ]);

    const deleted = await eventDao.deleteEventsNotSyncedSince(boundary);

    expect(deleted).toBe(1);
    expect(await storedExternalIds()).toEqual(['at', 'fresh']);
  });
});

describe('Unmocked: EventDao.findNearbyUpcomingEvents', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW, doNotFake: KEEP_REAL_TIMERS as never });
  });

  // Input: events 5 km and 15 km north of the query point, with a 10 km limit.
  // Expected output: only the 5 km event, with distanceKm about 5 and no _id.
  // Expected behavior: distance is returned in kilometres and far events are excluded.
  test('returns only events within the distance, with distanceKm and no _id', async () => {
    await eventDao.upsertEvents([eventNorthOfUser('near', 5), eventNorthOfUser('far', 15)]);

    const found = await eventDao.findNearbyUpcomingEvents(NEARBY_QUERY);

    expect(found.map((event) => event.externalId)).toEqual(['near']);
    expect(found[0]?.distanceKm).toBeCloseTo(5, 2);
    expect(found[0]).not.toHaveProperty('_id');
  });

  // Input: an event 5 km north of the query point and a query centred 5 km south of it.
  // Expected output: the event is found only when the query uses the nearby coordinates.
  // Expected behavior: the supplied longitude and latitude are the search centre.
  test('searches around the supplied coordinates', async () => {
    await eventDao.upsertEvents([eventNorthOfUser('north', 5)]);

    const distantQuery = await eventDao.findNearbyUpcomingEvents({
      ...NEARBY_QUERY,
      latitude: CORE_LATITUDE - 20,
    });
    const nearbyQuery = await eventDao.findNearbyUpcomingEvents(NEARBY_QUERY);

    expect(distantQuery).toEqual([]);
    expect(nearbyQuery).toHaveLength(1);
  });

  // Input: events starting 1 ms before, exactly at, and 1 ms after the current time.
  // Expected output: the events at and after the current time.
  // Expected behavior: events that have already started are excluded.
  test('excludes events that have already started', async () => {
    await eventDao.upsertEvents([
      eventNorthOfUser('started', 1, { startDateTime: new Date(FIXED_NOW.getTime() - 1) }),
      eventNorthOfUser('starting-now', 1, { startDateTime: FIXED_NOW }),
      eventNorthOfUser('upcoming', 1, { startDateTime: new Date(FIXED_NOW.getTime() + 1) }),
    ]);

    const found = await eventDao.findNearbyUpcomingEvents(NEARBY_QUERY);

    expect(found.map((event) => event.externalId).sort()).toEqual(['starting-now', 'upcoming']);
  });

  // Input: three nearby events and an explicit candidateLimit of 2.
  // Expected output: the two nearest events, nearest first.
  // Expected behavior: the explicit limit is respected.
  test('respects an explicit candidate limit', async () => {
    await eventDao.upsertEvents([
      eventNorthOfUser('third', 3),
      eventNorthOfUser('first', 1),
      eventNorthOfUser('second', 2),
    ]);

    const found = await eventDao.findNearbyUpcomingEvents({ ...NEARBY_QUERY, candidateLimit: 2 });

    expect(found.map((event) => event.externalId)).toEqual(['first', 'second']);
  });

  // Input: 201 nearby events and no candidateLimit.
  // Expected output: 200 events.
  // Expected behavior: the default candidate limit is 200.
  test('uses a default candidate limit of 200', async () => {
    await eventDao.upsertEvents(
      Array.from({ length: 201 }, (_, n) => eventNorthOfUser(`bulk-${n}`, 1)),
    );

    const found = await eventDao.findNearbyUpcomingEvents(NEARBY_QUERY);

    expect(found).toHaveLength(200);
  });
});
