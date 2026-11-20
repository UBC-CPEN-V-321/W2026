import 'dotenv/config';

import * as os from 'node:os';

import express, { type Express } from 'express';
import { type Db, MongoClient, ObjectId } from 'mongodb';

import { env } from '../../../src/config/env';
import {
  createApp as createBackendApp,
  type AppDependencies,
} from '../../../src/index';
import { ItineraryDao } from '../../../src/itineraries/itineraryDao';
import { GoogleMapsClient } from '../../../src/maps/googleMapsClient';
import { ItineraryMapDao } from '../../../src/maps/itineraryMapDao';
import { createItineraryMapRouter } from '../../../src/maps/itineraryMapRouter';
import { ItineraryMapService } from '../../../src/maps/itineraryMapService';
import {
  authenticatedAgent,
  MongoTestSessions,
} from '../../utils/authTestUtils';

jest.setTimeout(60_000);

const USER_ID = new ObjectId();
const OTHER_USER_ID = new ObjectId();
const ITINERARY_ID = new ObjectId();
const MISSING_ITINERARY_ID = new ObjectId();
const DATABASE_NAME = `eubc_map_${new ObjectId().toHexString()}`;
const MAP_PATH =
  `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/map`;

let client: MongoClient;
let database: Db;
let app: Express;
let mapDao: ItineraryMapDao;
let mapService: ItineraryMapService;
let testSessions: MongoTestSessions;

function createApp(dependencies: Omit<AppDependencies, 'sessionService'>): Express {
  return createBackendApp({
    ...dependencies,
    sessionService: testSessions.service,
  });
}

const request = (expressApp: Express) => authenticatedAgent(
  expressApp,
  (userId) =>
    testSessions.tokenFor(userId) ?? testSessions.tokenFor(USER_ID.toHexString()),
);

function seededItinerary() {
  return {
    _id: ITINERARY_ID,
    ownerId: USER_ID,
    name: 'Live map itinerary',
    startingLocation: 'UBC Bus Exchange, Vancouver, BC',
    items: [{
      id: 'activity-1',
      type: 'activity',
      name: 'UBC Bookstore',
      category: 'other',
      location: '6200 University Blvd, Vancouver, BC',
      startTime: '2027-11-30T17:00:00.000Z',
      endTime: '2027-11-30T18:00:00.000Z',
    }],
    createdAt: new Date('2026-10-12T12:00:00.000Z'),
    updatedAt: new Date('2026-10-12T12:00:00.000Z'),
    saved: true,
    inRecommendation: false,
    score: {},
  };
}

beforeAll(async () => {
  for (const variable of [
    'MONGODB_URI',
    'GEOCODING_API_KEY',
    'ROUTES_API_KEY',
  ]) {
    if (process.env[variable] === undefined || process.env[variable]!.trim() === '') {
      throw new Error(`${variable} is required for no-mock map tests.`);
    }
  }

  client = new MongoClient(process.env.MONGODB_URI!, {
    runtimeAdapters: { os },
    serverSelectionTimeoutMS: 10_000,
  });
  database = client.db(DATABASE_NAME);
  testSessions = new MongoTestSessions(database);
  mapDao = new ItineraryMapDao(database);
  mapService = new ItineraryMapService(
    new ItineraryDao(database),
    mapDao,
    new GoogleMapsClient(),
  );
  app = createApp({
    itineraryRepository: new ItineraryDao(database),
    itineraryMapRepository: mapDao,
  });
  await client.connect();
  await mapDao.createIndexes();
});

beforeEach(async () => {
  await testSessions.reset([
    USER_ID.toHexString(),
    OTHER_USER_ID.toHexString(),
  ]);
  await database.collection('itineraries').deleteMany({});
  await database.collection('itineraryMaps').deleteMany({});
  await database.collection('itineraries').insertOne(seededItinerary());
});

afterAll(async () => {
  await database.dropDatabase();
  await client.close();
});

describe('GET /api/v1/users/:userId/itineraries/:itineraryId/map — no mocks', () => {
  test('generates and persists map data using MongoDB and Google Maps', async () => {
    const response = await request(app).get(MAP_PATH);

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap).toMatchObject({
      itineraryId: ITINERARY_ID.toHexString(),
      ownerId: USER_ID.toHexString(),
      itineraryUpdatedAt: '2026-10-12T12:00:00.000Z',
      unmappedActivities: [],
    });
    expect(response.body.itineraryMap.markers.map(
      (marker: { activityId: string }) => marker.activityId,
    )).toEqual(['starting-location', 'activity-1']);
    expect(response.body.itineraryMap.routes).toHaveLength(2);
    for (const route of response.body.itineraryMap.routes) {
      expect(route.walking).toMatchObject({
        encodedPolyline: expect.any(String),
        distanceMeters: expect.any(Number),
        durationSeconds: expect.any(Number),
      });
      expect(route.driving).toMatchObject({
        encodedPolyline: expect.any(String),
        distanceMeters: expect.any(Number),
        durationSeconds: expect.any(Number),
      });
    }

    await expect(mapDao.findByItineraryId(
      ITINERARY_ID.toHexString(),
    )).resolves.toEqual(response.body.itineraryMap);
  });

  test('returns a current persisted cache with API-safe IDs and dates', async () => {
    const itinerary = seededItinerary();
    await database.collection('itineraryMaps').insertOne({
      _id: new ObjectId(),
      itineraryId: ITINERARY_ID,
      ownerId: USER_ID,
      itineraryUpdatedAt: itinerary.updatedAt,
      markers: [
        {
          activityId: 'starting-location',
          title: 'Starting location',
          address: itinerary.startingLocation,
          placeId: 'cached-start',
          coordinates: { latitude: 49.265, longitude: -123.249 },
          isApproximate: false,
        },
        {
          activityId: 'activity-1',
          title: 'UBC Bookstore',
          address: itinerary.items[0]!.location,
          placeId: 'cached-activity',
          coordinates: { latitude: 49.267, longitude: -123.25 },
          isApproximate: false,
        },
      ],
      routes: [{
        fromActivityId: 'activity-1',
        toActivityId: 'starting-location',
        transportationMode: 'driving',
        encodedPolyline: 'cached',
        distanceMeters: 100,
        durationSeconds: 60,
        walking: null,
        driving: null,
      }],
      generatedAt: new Date('2026-10-12T12:05:00.000Z'),
    });

    const response = await request(app).get(MAP_PATH);

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap).toMatchObject({
      itineraryId: ITINERARY_ID.toHexString(),
      ownerId: USER_ID.toHexString(),
      generatedAt: '2026-10-12T12:05:00.000Z',
      unmappedActivities: [],
    });
  });

  test('stores an empty map for an itinerary without locations', async () => {
    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      {
        $unset: { startingLocation: '' },
        $set: { items: [], updatedAt: new Date('2026-10-13T12:00:00.000Z') },
      },
    );

    const response = await request(app).get(MAP_PATH);

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap).toMatchObject({
      markers: [],
      routes: [],
      unmappedActivities: [],
    });
    await expect(database.collection('itineraryMaps').countDocuments({
      itineraryId: ITINERARY_ID,
    })).resolves.toBe(1);
  });

  test('returns not found for an absent or differently owned itinerary', async () => {
    for (const path of [
      `/api/v1/users/${USER_ID}/itineraries/${MISSING_ITINERARY_ID}/map`,
      `/api/v1/users/${OTHER_USER_ID}/itineraries/${ITINERARY_ID}/map`,
    ]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
    }
  });
  test('records a blank activity location as unmapped without requesting routes', async () => {
    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      {
        $unset: { startingLocation: '' },
        $set: {
          updatedAt: new Date('2026-10-13T12:00:00.000Z'),
          items: [
            {
              id: 'transport-1',
              type: 'transportation',
              mode: 'walking',
              startLocation: 'Unknown',
              endLocation: 'UBC Bookstore',
              distanceMeters: 100,
              startTime: '2027-11-30T16:30:00.000Z',
              endTime: '2027-11-30T16:45:00.000Z',
            },
            {
              id: 'activity-unmapped',
              type: 'activity',
              name: 'Unknown',
              category: 'other',
              location: ' ',
              startTime: '2027-11-30T16:00:00.000Z',
              endTime: '2027-11-30T16:30:00.000Z',
            },
            {
              id: 'activity-known',
              type: 'activity',
              name: 'UBC Bookstore',
              category: 'other',
              location: '6200 University Blvd, Vancouver, BC',
              startTime: '2027-11-30T17:00:00.000Z',
              endTime: '2027-11-30T18:00:00.000Z',
            },
          ],
        },
      },
    );

    const response = await request(app).get(MAP_PATH);

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap.markers).toHaveLength(1);
    expect(response.body.itineraryMap.routes).toEqual([]);
    expect(response.body.itineraryMap.unmappedActivities).toEqual([{
      activityId: 'activity-unmapped',
      title: 'Unknown',
      address: ' ',
    }]);
  });

  test.each([
    [true, 'walking'],
    [false, 'driving'],
  ])(
    'uses the stored transportation mode when present=%s',
    async (withTransportation, expectedMode) => {
      const items = [
        {
          id: 'activity-1',
          type: 'activity',
          name: 'UBC Bookstore',
          category: 'other',
          location: '6200 University Blvd, Vancouver, BC',
          startTime: '2027-11-30T17:00:00.000Z',
          endTime: '2027-11-30T18:00:00.000Z',
        },
        ...(withTransportation ? [{
          id: 'transport-1',
          type: 'transportation',
          mode: 'walking',
          startLocation: 'UBC Bookstore',
          endLocation: 'UBC Nest',
          distanceMeters: 500,
          startTime: '2027-11-30T18:00:00.000Z',
          endTime: '2027-11-30T18:15:00.000Z',
        }] : []),
        {
          id: 'activity-2',
          type: 'activity',
          name: 'UBC Nest',
          category: 'other',
          location: '6133 University Blvd, Vancouver, BC',
          startTime: '2027-11-30T18:30:00.000Z',
          endTime: '2027-11-30T19:00:00.000Z',
        },
      ];
      await database.collection('itineraries').updateOne(
        { _id: ITINERARY_ID },
        {
          $unset: { startingLocation: '' },
          $set: {
            items,
            updatedAt: new Date('2026-10-13T12:00:00.000Z'),
          },
        },
      );

      const response = await request(app).get(MAP_PATH);

      expect(response.status).toBe(200);
      expect(response.body.itineraryMap.routes).toHaveLength(1);
      expect(response.body.itineraryMap.routes[0]).toMatchObject({
        transportationMode: expectedMode,
        walking: expect.any(Object),
        driving: expect.any(Object),
      });
    },
  );

  test('falls back to stale cache when live regeneration is misconfigured', async () => {
    await database.collection('itineraryMaps').insertOne(staleMapDocument());
    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      { $set: { updatedAt: new Date('2026-10-13T12:00:00.000Z') } },
    );

    const response = await withGoogleMapConfig(
      'geocodingApiKey',
      undefined,
      () => request(app).get(MAP_PATH),
    );

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap.generatedAt).toBe(
      '2026-10-12T12:05:00.000Z',
    );
  });

  test('returns an internal error when generation is misconfigured without cache', async () => {
    const response = await withGoogleMapConfig(
      'geocodingApiKey',
      undefined,
      () => request(app).get(MAP_PATH),
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('records an unresolved starting location', async () => {
    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      {
        $set: {
          startingLocation: 'zzzzqvxx 000000 nonexistent nowhere',
          items: [],
          updatedAt: new Date('2026-10-13T12:00:00.000Z'),
        },
      },
    );

    const response = await request(app).get(MAP_PATH);

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap.unmappedActivities).toEqual([{
      activityId: 'starting-location',
      title: 'Starting location',
      address: 'zzzzqvxx 000000 nonexistent nowhere',
    }]);
  });

  test('omits a segment when live APIs find no route between its stops', async () => {
    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      {
        $unset: { startingLocation: '' },
        $set: {
          updatedAt: new Date('2026-10-13T12:00:00.000Z'),
          items: [
            {
              id: 'activity-1',
              type: 'activity',
              name: 'UBC',
              category: 'other',
              location: '6200 University Blvd, Vancouver, BC',
              startTime: '2027-11-30T17:00:00.000Z',
              endTime: '2027-11-30T18:00:00.000Z',
            },
            {
              id: 'activity-2',
              type: 'activity',
              name: 'Tokyo',
              category: 'other',
              location: 'Tokyo, Japan',
              startTime: '2027-11-30T19:00:00.000Z',
              endTime: '2027-11-30T20:00:00.000Z',
            },
          ],
        },
      },
    );

    const response = await request(app).get(MAP_PATH);

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap.markers).toHaveLength(2);
    expect(response.body.itineraryMap.routes).toEqual([]);
  });

  test('accepts current caches for each non-routable itinerary shape', async () => {
    const currentUpdate = new Date('2026-10-12T12:00:00.000Z');

    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      { $set: { items: [] } },
    );
    await database.collection('itineraryMaps').insertOne({
      ...staleMapDocument(),
      itineraryUpdatedAt: currentUpdate,
      markers: [],
      routes: [],
      unmappedActivities: [{
        activityId: 'starting-location',
        title: 'Starting location',
        address: 'UBC Bus Exchange, Vancouver, BC',
      }],
    });
    let response = await request(app).get(MAP_PATH);
    expect(response.status).toBe(200);

    await database.collection('itineraryMaps').deleteMany({});
    await database.collection('itineraries').updateOne(
      { _id: ITINERARY_ID },
      { $unset: { startingLocation: '' } },
    );
    await database.collection('itineraryMaps').insertOne({
      ...staleMapDocument(),
      itineraryUpdatedAt: currentUpdate,
      markers: [],
      routes: [],
      unmappedActivities: [],
    });
    response = await request(app).get(MAP_PATH);
    expect(response.status).toBe(200);

    await database.collection('itineraryMaps').deleteMany({});
    await database.collection('itineraries').deleteMany({});
    await database.collection('itineraries').insertOne(seededItinerary());
    await database.collection('itineraryMaps').insertOne({
      ...staleMapDocument(),
      itineraryUpdatedAt: currentUpdate,
      markers: [staleMapDocument().markers[0]],
      routes: [],
      unmappedActivities: [{
        activityId: 'activity-1',
        title: 'UBC Bookstore',
        address: '6200 University Blvd, Vancouver, BC',
      }],
    });
    response = await request(app).get(MAP_PATH);
    expect(response.status).toBe(200);
  });

  test.each([
    ['legacy travel options', {
      routes: [{
        fromActivityId: 'starting-location',
        toActivityId: 'activity-1',
        transportationMode: 'driving',
        encodedPolyline: 'legacy',
        distanceMeters: 100,
        durationSeconds: 60,
      }],
    }],
    ['missing starting marker', {
      markers: [],
      unmappedActivities: [],
    }],
    ['missing return route', {
      routes: [],
    }],
  ])('regenerates a current cache with %s', async (_name, overrides) => {
    await database.collection('itineraryMaps').insertOne({
      ...staleMapDocument(),
      itineraryUpdatedAt: new Date('2026-10-12T12:00:00.000Z'),
      ...overrides,
    });

    const response = await withGoogleMapConfig(
      'geocodingApiKey',
      undefined,
      () => request(app).get(MAP_PATH),
    );

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap.generatedAt).toBe(
      '2026-10-12T12:05:00.000Z',
    );
  });
});

describe('Itinerary map persistence guards — no mocks', () => {
  test('returns safe results for malformed or missing IDs', async () => {
    await expect(mapDao.findByItineraryId('not-an-id')).resolves.toBeNull();
    await expect(mapDao.findByItineraryId(
      MISSING_ITINERARY_ID.toHexString(),
    )).resolves.toBeNull();
    await expect(mapDao.deleteByItineraryId('not-an-id')).resolves.toBe(false);
    await expect(mapDao.deleteByItineraryId(
      MISSING_ITINERARY_ID.toHexString(),
    )).resolves.toBe(false);
  });

  test.each([
    ['not-an-id', USER_ID.toHexString()],
    [ITINERARY_ID.toHexString(), 'not-an-id'],
  ])('rejects invalid persisted IDs (%s, %s)', async (itineraryId, ownerId) => {
    await expect(mapDao.upsertMapData({
      itineraryId,
      ownerId,
      itineraryUpdatedAt: '2026-10-12T12:00:00.000Z',
      markers: [],
      routes: [],
      unmappedActivities: [],
      generatedAt: '2026-10-12T12:05:00.000Z',
    })).rejects.toThrow('Itinerary map contains an invalid ID');
  });

  test('replaces and deletes persisted map data', async () => {
    const mapData = {
      itineraryId: ITINERARY_ID.toHexString(),
      ownerId: USER_ID.toHexString(),
      itineraryUpdatedAt: '2026-10-12T12:00:00.000Z',
      markers: [],
      routes: [],
      unmappedActivities: [],
      generatedAt: '2026-10-12T12:05:00.000Z',
    };
    await mapDao.upsertMapData(mapData);
    await mapDao.upsertMapData({
      ...mapData,
      generatedAt: '2026-10-12T12:06:00.000Z',
    });

    await expect(
      mapDao.findByItineraryId(ITINERARY_ID.toHexString()),
    ).resolves.toMatchObject({
      generatedAt: '2026-10-12T12:06:00.000Z',
    });
    await expect(
      mapDao.deleteByItineraryId(ITINERARY_ID.toHexString()),
    ).resolves.toBe(true);
  });
  test('deletes cached data through the map service', async () => {
    await database.collection('itineraryMaps').insertOne(staleMapDocument());

    await mapService.deleteItineraryMap(ITINERARY_ID.toHexString());

    await expect(database.collection('itineraryMaps').countDocuments({
      itineraryId: ITINERARY_ID,
    })).resolves.toBe(0);
  });
});

describe('Itinerary map router validation — no mocks', () => {
  test('rejects a request without a user route parameter', async () => {
    const routerApp = express();
    routerApp.use('/map', createItineraryMapRouter(mapService));

    const response = await authenticatedAgent(routerApp).get('/map');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_USER_ID');
  });

  test('rejects a request without an itinerary route parameter', async () => {
    const routerApp = express();
    routerApp.use(
      '/users/:userId/map',
      createItineraryMapRouter(mapService),
    );

    const response = await authenticatedAgent(routerApp).get(
      `/users/${USER_ID}/map`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });
});

describe('Google Maps client boundaries — no mocks', () => {
  const googleMapsClient = new GoogleMapsClient();
  const origin = { latitude: 49.266, longitude: -123.249 };
  const destination = { latitude: 49.267, longitude: -123.251 };

  test('returns no geocode result for blank input', async () => {
    await expect(googleMapsClient.geocodeAddress('   ')).resolves.toBeNull();
  });

  test.each([undefined, '', 'your-placeholder-key'])(
    'rejects unusable geocoding configuration %s',
    async (apiKey) => {
      await expect(withGoogleMapConfig(
        'geocodingApiKey',
        apiKey,
        () => googleMapsClient.geocodeAddress('UBC'),
      )).rejects.toThrow('GEOCODING_API_KEY is not configured');
    },
  );

  test.each([undefined, '', 'your-placeholder-key'])(
    'rejects unusable routes configuration %s',
    async (apiKey) => {
      await expect(withGoogleMapConfig(
        'routesApiKey',
        apiKey,
        () => googleMapsClient.getRoute(origin, destination, 'walking'),
      )).rejects.toThrow('ROUTES_API_KEY is not configured');
    },
  );

  test.each(['cycling', 'transit', 'other'] as const)(
    'sends a live %s route request',
    async (mode) => {
      const route = await googleMapsClient.getRoute(
        origin,
        destination,
        mode,
      );
      expect(route === null || route.encodedPolyline.length > 0).toBe(true);
    },
  );

  test('returns null for coordinates rejected by the live Routes API', async () => {
    await expect(googleMapsClient.getRoute(
      { latitude: 999, longitude: 999 },
      destination,
      'walking',
    )).resolves.toBeNull();
  });

  test('returns null when live geocoding finds no matching address', async () => {
    await expect(googleMapsClient.geocodeAddress(
      'zzzzqvxx 000000 nonexistent nowhere',
    )).resolves.toBeNull();
  });
});

type GoogleMapsConfig = {
  geocodingApiKey: string | undefined;
  routesApiKey: string | undefined;
};

async function withGoogleMapConfig<T>(
  key: keyof GoogleMapsConfig,
  value: string | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const config = env.googleMaps as GoogleMapsConfig;
  const original = config[key];
  config[key] = value;
  try {
    return await action();
  } finally {
    config[key] = original;
  }
}

function staleMapDocument() {
  const travelOption = {
    encodedPolyline: 'cached',
    distanceMeters: 100,
    durationSeconds: 60,
    steps: [],
  };
  return {
    _id: new ObjectId(),
    itineraryId: ITINERARY_ID,
    ownerId: USER_ID,
    itineraryUpdatedAt: new Date('2026-10-11T12:00:00.000Z'),
    markers: [
      {
        activityId: 'starting-location',
        title: 'Starting location',
        address: 'UBC Bus Exchange, Vancouver, BC',
        placeId: 'cached-start',
        coordinates: { latitude: 49.265, longitude: -123.249 },
        isApproximate: false,
      },
      {
        activityId: 'activity-1',
        title: 'UBC Bookstore',
        address: '6200 University Blvd, Vancouver, BC',
        placeId: 'cached-activity',
        coordinates: { latitude: 49.267, longitude: -123.25 },
        isApproximate: false,
      },
    ],
    routes: [{
      fromActivityId: 'activity-1',
      toActivityId: 'starting-location',
      transportationMode: 'driving',
      encodedPolyline: 'cached',
      distanceMeters: 100,
      durationSeconds: 60,
      walking: travelOption,
      driving: travelOption,
    }],
    unmappedActivities: [],
    generatedAt: new Date('2026-10-12T12:05:00.000Z'),
  };
}
