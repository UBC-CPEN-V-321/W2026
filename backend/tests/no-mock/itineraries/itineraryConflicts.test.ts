import 'dotenv/config';

import * as os from 'node:os';

import type { Express } from 'express';
import { Db, MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';

import { createApp } from '../../../src/index';
import { ItineraryDao } from '../../../src/itineraries/itineraryDao';
import type { ActivityItem } from '../../../src/itineraries/itineraryTypes';

jest.setTimeout(30_000);

const USER_ID = new ObjectId();
const ITINERARY_ID = new ObjectId();
const MISSING_ITINERARY_ID = new ObjectId();
const ACTIVITY_ID = 'activity-1';
const SEGMENT_ID = 'transportation-1';
// A fixed name, reused every run, so test databases never pile up on the shared cluster.
const DATABASE_NAME = 'eubc_itinerary_conflicts';

const ACTIVITIES_PATH = `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities`;
const ACTIVITY_PATH = `${ACTIVITIES_PATH}/${ACTIVITY_ID}`;

/** Stored schedule: the activity runs 17:00-18:00 and the transportation 18:00-18:30. */
const STORED_ACTIVITY_TIMES = {
  startTime: '2027-11-30T17:00:00.000Z',
  endTime: '2027-11-30T18:00:00.000Z',
};

function activityInput(startTime: string, endTime: string, name = 'New activity') {
  return {
    type: 'activity',
    name,
    description: 'Added through the API.',
    category: 'outdoors',
    location: 'UBC',
    startTime,
    endTime,
  };
}

function seededItinerary() {
  return {
    _id: ITINERARY_ID,
    ownerId: USER_ID,
    name: 'Existing itinerary',
    description: 'Stored in the real test database.',
    startingLocation: 'UBC Bus Exchange',
    items: [
      {
        id: ACTIVITY_ID,
        type: 'activity',
        name: 'Museum of Anthropology',
        image: 'https://example.com/moa.jpg',
        description: 'Explore the museum.',
        category: 'art',
        location: '6393 NW Marine Drive, Vancouver, BC',
        ...STORED_ACTIVITY_TIMES,
      },
      {
        id: SEGMENT_ID,
        type: 'transportation',
        mode: 'walking',
        startLocation: 'Museum of Anthropology',
        endLocation: 'UBC Nest',
        distanceMeters: 1200,
        startTime: '2027-11-30T18:00:00.000Z',
        endTime: '2027-11-30T18:30:00.000Z',
      },
    ],
    createdAt: new Date('2026-10-12T12:00:00.000Z'),
    updatedAt: new Date('2026-10-12T12:00:00.000Z'),
    saved: true,
    inRecommendation: false,
    score: {},
  };
}

let client: MongoClient;
let database: Db;
let app: Express;
let itineraryDao: ItineraryDao;

async function storedItems(): Promise<Record<string, unknown>[]> {
  const document = await database.collection('itineraries').findOne({ _id: ITINERARY_ID });
  return (document?.items ?? []) as Record<string, unknown>[];
}

async function storedItemIds(): Promise<string[]> {
  return (await storedItems()).map((item) => item.id as string);
}

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined || uri.trim() === '') {
    throw new Error('MONGODB_URI is required for no-mock tests.');
  }
  client = new MongoClient(uri, { runtimeAdapters: { os }, serverSelectionTimeoutMS: 10_000 });
  database = client.db(DATABASE_NAME);
  itineraryDao = new ItineraryDao(database);
  app = createApp({ itineraryRepository: itineraryDao });
  await client.connect();
});

beforeEach(async () => {
  await database.collection('itineraries').deleteMany({});
  await database.collection('itineraries').insertOne(seededItinerary());
});

afterAll(async () => {
  try {
    await database.collection('itineraries').deleteMany({});
  } finally {
    await client.close();
  }
});

describe('POST /api/v1/users/:userId/itineraries/:itineraryId/activities — time conflicts, no mocks', () => {
  // Input: activities that touch a stored item exactly at its start or end (16:00-17:00, 18:30-19:30).
  // Expected status code: 201.
  // Expected behavior: items that only touch do not overlap, so both are stored.
  test.each([
    ['ends exactly when the stored activity starts', '2027-11-30T16:00:00.000Z', '2027-11-30T17:00:00.000Z'],
    ['starts exactly when the stored transportation ends', '2027-11-30T18:30:00.000Z', '2027-11-30T19:30:00.000Z'],
  ])('allows an activity that %s', async (_label, startTime, endTime) => {
    const response = await request(app).post(ACTIVITIES_PATH).send(activityInput(startTime, endTime));

    expect(response.status).toBe(201);
    expect(await storedItems()).toHaveLength(3);
  });

  // Input: an activity overlapping the stored activity by one millisecond (16:00 to 17:00:00.001).
  // Expected status code: 409 with ITINERARY_TIME_CONFLICT.
  // Expected output: the conflicting item's id, type, name and times.
  // Expected behavior: the itinerary is not changed.
  test('rejects a one millisecond overlap and lists the conflicting item', async () => {
    const response = await request(app)
      .post(ACTIVITIES_PATH)
      .send(activityInput('2027-11-30T16:00:00.000Z', '2027-11-30T17:00:00.001Z'));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ITINERARY_TIME_CONFLICT');
    expect(response.body.error.conflicts).toEqual([
      {
        id: ACTIVITY_ID,
        type: 'activity',
        name: 'Museum of Anthropology',
        ...STORED_ACTIVITY_TIMES,
      },
    ]);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID]);
  });

  // Input: an activity from 17:30 to 18:15, overlapping both the stored activity and the transportation.
  // Expected status code: 409.
  // Expected output: both conflicts, the transportation named "<start> to <end>".
  test('lists every overlapping item, naming transportation by its route', async () => {
    const response = await request(app)
      .post(ACTIVITIES_PATH)
      .send(activityInput('2027-11-30T17:30:00.000Z', '2027-11-30T18:15:00.000Z'));

    expect(response.status).toBe(409);
    expect(
      response.body.error.conflicts.map((conflict: { id: string; name: string }) => [conflict.id, conflict.name]),
    ).toEqual([
      [ACTIVITY_ID, 'Museum of Anthropology'],
      [SEGMENT_ID, 'Museum of Anthropology to UBC Nest'],
    ]);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID]);
  });

  // Input: a conflicting activity with replaceConflicts set to a value other than "true".
  // Expected status code: 409.
  // Expected behavior: only the exact value "true" turns replacement on.
  test.each(['false', '1', 'TRUE', ''])('does not replace when replaceConflicts is "%s"', async (value) => {
    const response = await request(app)
      .post(`${ACTIVITIES_PATH}?replaceConflicts=${value}`)
      .send(activityInput('2027-11-30T17:30:00.000Z', '2027-11-30T17:45:00.000Z'));

    expect(response.status).toBe(409);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID]);
  });
});

describe('POST /api/v1/users/:userId/itineraries/:itineraryId/activities?replaceConflicts=true — no mocks', () => {
  // Input: an activity from 16:30 to 17:30 overlapping only the stored activity.
  // Expected status code: 201.
  // Expected behavior: the stored activity is removed, the new one stored, the transportation kept.
  test('replaces a single conflicting activity', async () => {
    const before = await database.collection('itineraries').findOne({ _id: ITINERARY_ID });
    const response = await request(app)
      .post(`${ACTIVITIES_PATH}?replaceConflicts=true`)
      .send(activityInput('2027-11-30T16:30:00.000Z', '2027-11-30T17:30:00.000Z'));

    expect(response.status).toBe(201);
    const newId = response.body.activity.id as string;
    expect(await storedItemIds()).toEqual([SEGMENT_ID, newId]);
    const after = await database.collection('itineraries').findOne({ _id: ITINERARY_ID });
    const updatedBefore = (before?.updatedAt as Date).getTime();
    const updatedAfter = (after?.updatedAt as Date).getTime();
    expect(updatedAfter).toBeGreaterThan(updatedBefore);
  });

  // Input: an activity from 17:30 to 18:15, overlapping both stored items.
  // Expected status code: 201.
  // Expected behavior: both conflicting items are removed and only the new activity remains.
  test('replaces several conflicting items at once', async () => {
    const response = await request(app)
      .post(`${ACTIVITIES_PATH}?replaceConflicts=true`)
      .send(activityInput('2027-11-30T17:30:00.000Z', '2027-11-30T18:15:00.000Z'));

    expect(response.status).toBe(201);
    expect(await storedItemIds()).toEqual([response.body.activity.id]);
  });

  // Input: an activity from 18:10 to 19:00 overlapping only the stored transportation.
  // Expected status code: 201.
  // Expected behavior: the transportation is removed and the stored activity is kept.
  test('replaces a conflicting transportation segment and keeps the activity', async () => {
    const response = await request(app)
      .post(`${ACTIVITIES_PATH}?replaceConflicts=true`)
      .send(activityInput('2027-11-30T18:10:00.000Z', '2027-11-30T19:00:00.000Z'));

    expect(response.status).toBe(201);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, response.body.activity.id]);
  });

  // Input: an activity with no conflict (20:00-21:00) and replaceConflicts=true.
  // Expected status code: 201.
  // Expected behavior: nothing is removed; the activity is added.
  test('adds the activity normally when there is nothing to replace', async () => {
    const response = await request(app)
      .post(`${ACTIVITIES_PATH}?replaceConflicts=true`)
      .send(activityInput('2027-11-30T20:00:00.000Z', '2027-11-30T21:00:00.000Z'));

    expect(response.status).toBe(201);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID, response.body.activity.id]);
  });

  // Input: replaceConflicts=true on an itinerary that does not exist.
  // Expected status code: 404 ITINERARY_NOT_FOUND.
  test('returns not found for an absent itinerary', async () => {
    const response = await request(app)
      .post(`/api/v1/users/${USER_ID}/itineraries/${MISSING_ITINERARY_ID}/activities?replaceConflicts=true`)
      .send(activityInput('2027-11-30T17:30:00.000Z', '2027-11-30T18:15:00.000Z'));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });

  // Input: an invalid activity (end before start) with replaceConflicts=true.
  // Expected status code: 400.
  // Expected behavior: validation runs first, so nothing is replaced.
  test('validates the activity before replacing anything', async () => {
    const response = await request(app)
      .post(`${ACTIVITIES_PATH}?replaceConflicts=true`)
      .send(activityInput('2027-11-30T18:15:00.000Z', '2027-11-30T17:30:00.000Z'));

    expect(response.status).toBe(400);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID]);
  });
});

describe('PATCH /api/v1/users/:userId/itineraries/:itineraryId/activities/:activityId — time conflicts, no mocks', () => {
  // Input: edits that do not move the activity into another item (name only, a shorter time inside its own slot).
  // Expected status code: 200.
  // Expected behavior: an item does not conflict with its own old time.
  test.each([
    ['only the name', { name: 'Renamed activity' }],
    ['a time inside its own slot', { startTime: '2027-11-30T17:10:00.000Z', endTime: '2027-11-30T17:50:00.000Z' }],
  ])('allows editing %s', async (_label, update) => {
    const response = await request(app).patch(ACTIVITY_PATH).send(update);

    expect(response.status).toBe(200);
    expect(response.body.activity).toMatchObject(update);
  });

  // Input: moving the activity to 18:10-18:50, into the transportation's slot.
  // Expected status code: 409 listing the transportation.
  // Expected behavior: the stored activity is unchanged.
  test('rejects moving the activity into another item', async () => {
    const response = await request(app)
      .patch(ACTIVITY_PATH)
      .send({ startTime: '2027-11-30T18:10:00.000Z', endTime: '2027-11-30T18:50:00.000Z' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ITINERARY_TIME_CONFLICT');
    expect(response.body.error.conflicts.map((conflict: { id: string }) => conflict.id)).toEqual([SEGMENT_ID]);
    expect((await storedItems())[0]).toMatchObject(STORED_ACTIVITY_TIMES);
  });

  // Input: the same move with replaceConflicts=true.
  // Expected status code: 200.
  // Expected behavior: the transportation is removed; the activity keeps its id and other fields, takes the new times,
  // and is stored once, not duplicated.
  test('replaces the conflicting item and keeps the edited activity once', async () => {
    const response = await request(app)
      .patch(`${ACTIVITY_PATH}?replaceConflicts=true`)
      .send({ startTime: '2027-11-30T18:10:00.000Z', endTime: '2027-11-30T18:50:00.000Z' });

    expect(response.status).toBe(200);
    const items = await storedItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: ACTIVITY_ID,
      name: 'Museum of Anthropology',
      category: 'art',
      startTime: '2027-11-30T18:10:00.000Z',
      endTime: '2027-11-30T18:50:00.000Z',
    });
  });

  // Input: an edit whose merged times are invalid (end before start) with replaceConflicts=true.
  // Expected status code: 400.
  // Expected behavior: nothing is replaced.
  test('validates the merged times before replacing anything', async () => {
    const response = await request(app)
      .patch(`${ACTIVITY_PATH}?replaceConflicts=true`)
      .send({ startTime: '2027-11-30T18:20:00.000Z', endTime: '2027-11-30T18:10:00.000Z' });

    expect(response.status).toBe(400);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID]);
  });
});

describe('Itinerary repository replacement guards — no mocks', () => {
  const replacement: ActivityItem = {
    type: 'activity',
    id: 'replacement',
    name: 'Replacement',
    image: '',
    category: 'art',
    location: 'UBC',
    startTime: '2027-11-30T20:00:00.000Z',
    endTime: '2027-11-30T21:00:00.000Z',
  };

  // Input: malformed user or itinerary ids, and an itinerary that does not exist.
  // Expected output: false, and nothing is written.
  test('returns false for malformed ids and for an absent itinerary', async () => {
    await expect(
      itineraryDao.replaceEmbeddedItems('invalid-owner', String(ITINERARY_ID), [ACTIVITY_ID], replacement),
    ).resolves.toBe(false);
    await expect(
      itineraryDao.replaceEmbeddedItems(String(USER_ID), 'invalid-itinerary', [ACTIVITY_ID], replacement),
    ).resolves.toBe(false);
    await expect(
      itineraryDao.replaceEmbeddedItems(
        String(USER_ID),
        String(MISSING_ITINERARY_ID),
        [ACTIVITY_ID],
        replacement,
      ),
    ).resolves.toBe(false);
    expect(await storedItemIds()).toEqual([ACTIVITY_ID, SEGMENT_ID]);
  });
});
