import type { Express } from 'express';

import {
  createApp as createBackendApp,
  type AppDependencies,
} from '../../../src/index';
import type { ItineraryRepository } from '../../../src/itineraries/itineraryRepository';
import type { ItineraryMapRepository } from '../../../src/maps/itineraryMapRepository';
import {
  authenticatedAgent,
  createPathSessionValidator,
} from '../../utils/authTestUtils';
import {
  ACTIVITY_FIXTURE_ID,
  ACTIVITY_INPUT,
  CACHED_ITINERARY_MAP,
  CREATE_ITINERARY_INPUT,
  EMPTY_ITINERARY,
  ITINERARY_FIXTURE_ID,
  ITINERARY_FIXTURE_USER_ID,
  STORED_ITINERARY,
  TRANSPORTATION_FIXTURE_ID,
  TRANSPORTATION_INPUT,
} from '../../utils/itineraryFixtures';
import type { MockedRepository } from '../../utils/mockedRepository';

const USER_ID = ITINERARY_FIXTURE_USER_ID;
const ITINERARY_ID = ITINERARY_FIXTURE_ID;
const ACTIVITY_ID = ACTIVITY_FIXTURE_ID;
const SEGMENT_ID = TRANSPORTATION_FIXTURE_ID;

function createApp(dependencies: Omit<AppDependencies, 'sessionService'>): Express {
  return createBackendApp({
    ...dependencies,
    sessionService: createPathSessionValidator(),
  });
}

const request = (app: Express) => authenticatedAgent(app);

const CREATE_INPUT = CREATE_ITINERARY_INPUT;

function createMockRepository(): MockedRepository<ItineraryRepository> {
  return {
    insertItinerary: jest.fn(),
    findItineraryDetails: jest.fn(),
    findItinerary: jest.fn(),
    findItineraries: jest.fn(),
    updateItineraryDetails: jest.fn(),
    insertEmbeddedActivity: jest.fn(),
    insertEmbeddedTransportationSegment: jest.fn(),
    removeEmbeddedActivity: jest.fn(),
    removeEmbeddedTransportationSegment: jest.fn(),
    updateEmbeddedActivity: jest.fn(),
    updateEmbeddedTransportationSegment: jest.fn(),
    replaceEmbeddedItems: jest.fn(),
    removeItinerary: jest.fn(),
  };
}

describe('POST /api/v1/users/:userId/itineraries — mocks', () => {
  test('returns 500 when itinerary insertion fails', async () => {
    // Input: valid itinerary. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: insertItinerary rejects to simulate a database write failure.
    const repository = createMockRepository();
    repository.insertItinerary.mockRejectedValue(new Error('write failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .post(`/api/v1/users/${USER_ID}/itineraries`)
      .send(CREATE_INPUT);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(repository.insertItinerary).toHaveBeenCalledWith(USER_ID, CREATE_INPUT);
  });
});

describe('GET /api/v1/users/:userId/itineraries — mocks', () => {
  test('returns 500 when the itinerary-list query fails', async () => {
    // Input: valid owner and filter. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: findItineraries rejects to simulate a database read failure.
    const repository = createMockRepository();
    repository.findItineraries.mockRejectedValue(new Error('read failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).get(
      `/api/v1/users/${USER_ID}/itineraries?saved=true`,
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(repository.findItineraries).toHaveBeenCalledWith(USER_ID, { saved: true });
  });
});

describe('GET /api/v1/users/:userId/itineraries/:itineraryId/details — mocks', () => {
  test('returns 500 when loading itinerary details fails', async () => {
    // Input: valid owner and itinerary IDs. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: findItineraryDetails rejects to simulate a database read failure.
    const repository = createMockRepository();
    repository.findItineraryDetails.mockRejectedValue(new Error('read failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).get(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/details`,
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/v1/users/:userId/itineraries/:itineraryId — mocks', () => {
  test('returns 500 when loading the complete itinerary fails', async () => {
    // Input: valid owner and itinerary IDs. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: findItinerary rejects to simulate a database read failure.
    const repository = createMockRepository();
    repository.findItinerary.mockRejectedValue(new Error('read failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).get(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}`,
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('PATCH /api/v1/users/:userId/itineraries/:itineraryId — mocks', () => {
  test('returns 500 when the detail update throws', async () => {
    // Input: valid detail update. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: updateItineraryDetails rejects to simulate a database write failure.
    const repository = createMockRepository();
    repository.updateItineraryDetails.mockRejectedValue(new Error('write failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}`)
      .send({ name: 'Updated itinerary' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when the itinerary disappears before update', async () => {
    // Input: valid detail update. Expect: 404 ITINERARY_NOT_FOUND.
    // Mock: updateItineraryDetails resolves false to simulate a concurrent deletion.
    const repository = createMockRepository();
    repository.updateItineraryDetails.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}`)
      .send({ name: 'Updated itinerary' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });
});

describe('DELETE /api/v1/users/:userId/itineraries/:itineraryId — mocks', () => {
  test('returns 500 when itinerary deletion throws', async () => {
    // Input: valid IDs. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: removeItinerary rejects to simulate a database write failure.
    const repository = createMockRepository();
    repository.removeItinerary.mockRejectedValue(new Error('delete failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}`,
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when no itinerary is deleted', async () => {
    // Input: valid IDs. Expect: 404 ITINERARY_NOT_FOUND.
    // Mock: removeItinerary resolves false to simulate a concurrent deletion.
    const repository = createMockRepository();
    repository.removeItinerary.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });
});

describe('Itinerary map routes — mocks', () => {
  test('returns a cached map without regenerating it', async () => {
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    const mapRepository: jest.Mocked<ItineraryMapRepository> = {
      findByItineraryId: jest.fn().mockResolvedValue(CACHED_ITINERARY_MAP),
      upsertMapData: jest.fn(),
      deleteByItineraryId: jest.fn().mockResolvedValue(true),
    };
    const app = createApp({
      itineraryRepository: repository,
      itineraryMapRepository: mapRepository,
    });

    const response = await request(app).get(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/map`,
    );

    expect(response.status).toBe(200);
    expect(response.body.itineraryMap).toEqual(CACHED_ITINERARY_MAP);
    expect(mapRepository.upsertMapData).not.toHaveBeenCalled();
  });

  test('removes cached map data after deleting an itinerary', async () => {
    const repository = createMockRepository();
    repository.removeItinerary.mockResolvedValue(true);
    const mapRepository: jest.Mocked<ItineraryMapRepository> = {
      findByItineraryId: jest.fn().mockResolvedValue(null),
      upsertMapData: jest.fn(),
      deleteByItineraryId: jest.fn().mockResolvedValue(true),
    };
    const app = createApp({
      itineraryRepository: repository,
      itineraryMapRepository: mapRepository,
    });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}`,
    );

    expect(response.status).toBe(204);
    expect(mapRepository.deleteByItineraryId).toHaveBeenCalledWith(ITINERARY_ID);
  });
});

describe('POST /api/v1/users/:userId/itineraries/:itineraryId/activities — mocks', () => {
  test('returns 500 when loading items for conflict detection fails', async () => {
    // Input: valid activity. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: findItinerary rejects before conflict detection.
    const repository = createMockRepository();
    repository.findItinerary.mockRejectedValue(new Error('read failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .post(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities`)
      .send(ACTIVITY_INPUT);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when the activity insert loses its itinerary', async () => {
    // Input: valid activity. Expect: 404 ITINERARY_NOT_FOUND.
    // Mock: initial read succeeds, then insertEmbeddedActivity resolves false.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.insertEmbeddedActivity.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .post(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities`)
      .send({
        ...ACTIVITY_INPUT,
        startTime: '2027-11-30T20:00:00.000Z',
        endTime: '2027-11-30T21:00:00.000Z',
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });
});

describe('PATCH /api/v1/users/:userId/itineraries/:itineraryId/activities/:activityId — mocks', () => {
  test('returns 500 when the activity update throws', async () => {
    // Input: valid activity update. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: read succeeds, then updateEmbeddedActivity rejects.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.updateEmbeddedActivity.mockRejectedValue(new Error('write failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities/${ACTIVITY_ID}`)
      .send({ name: 'Updated activity' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when the activity disappears during update', async () => {
    // Input: valid activity update. Expect: 404 ITINERARY_ITEM_NOT_FOUND.
    // Mock: read succeeds, then updateEmbeddedActivity resolves false.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.updateEmbeddedActivity.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities/${ACTIVITY_ID}`)
      .send({ name: 'Updated activity' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_ITEM_NOT_FOUND');
  });
});

describe('DELETE /api/v1/users/:userId/itineraries/:itineraryId/activities/:activityId — mocks', () => {
  test('returns 500 when activity removal throws', async () => {
    // Input: valid activity ID. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: read succeeds, then removeEmbeddedActivity rejects.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.removeEmbeddedActivity.mockRejectedValue(new Error('delete failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities/${ACTIVITY_ID}`,
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when the activity disappears during removal', async () => {
    // Input: valid activity ID. Expect: 404 ITINERARY_ITEM_NOT_FOUND.
    // Mock: read succeeds, then removeEmbeddedActivity resolves false.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.removeEmbeddedActivity.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities/${ACTIVITY_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_ITEM_NOT_FOUND');
  });
});

describe('POST /api/v1/users/:userId/itineraries/:itineraryId/transportation-segments — mocks', () => {
  test('returns 500 when transportation insertion throws', async () => {
    // Input: valid segment. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: insertEmbeddedTransportationSegment rejects.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(EMPTY_ITINERARY);
    repository.insertEmbeddedTransportationSegment.mockRejectedValue(
      new Error('write failed'),
    );
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .post(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/transportation-segments`)
      .send(TRANSPORTATION_INPUT);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when no itinerary accepts the segment', async () => {
    // Input: valid segment. Expect: 404 ITINERARY_NOT_FOUND.
    // Mock: insertEmbeddedTransportationSegment resolves false.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(EMPTY_ITINERARY);
    repository.insertEmbeddedTransportationSegment.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .post(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/transportation-segments`)
      .send(TRANSPORTATION_INPUT);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });
});

describe('PATCH /api/v1/users/:userId/itineraries/:itineraryId/transportation-segments/:segmentId — mocks', () => {
  test('returns 500 when the transportation update throws', async () => {
    // Input: valid segment update. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: read succeeds, then updateEmbeddedTransportationSegment rejects.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.updateEmbeddedTransportationSegment.mockRejectedValue(
      new Error('write failed'),
    );
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/transportation-segments/${SEGMENT_ID}`)
      .send({ mode: 'transit' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when the segment disappears during update', async () => {
    // Input: valid segment update. Expect: 404 ITINERARY_ITEM_NOT_FOUND.
    // Mock: read succeeds, then updateEmbeddedTransportationSegment resolves false.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.updateEmbeddedTransportationSegment.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/transportation-segments/${SEGMENT_ID}`)
      .send({ mode: 'transit' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_ITEM_NOT_FOUND');
  });
});

describe('DELETE /api/v1/users/:userId/itineraries/:itineraryId/transportation-segments/:segmentId — mocks', () => {
  test('returns 500 when transportation removal throws', async () => {
    // Input: valid segment ID. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: read succeeds, then removeEmbeddedTransportationSegment rejects.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.removeEmbeddedTransportationSegment.mockRejectedValue(
      new Error('delete failed'),
    );
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/transportation-segments/${SEGMENT_ID}`,
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('returns 404 when the segment disappears during removal', async () => {
    // Input: valid segment ID. Expect: 404 ITINERARY_ITEM_NOT_FOUND.
    // Mock: read succeeds, then removeEmbeddedTransportationSegment resolves false.
    const repository = createMockRepository();
    repository.findItinerary.mockResolvedValue(STORED_ITINERARY);
    repository.removeEmbeddedTransportationSegment.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).delete(
      `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/transportation-segments/${SEGMENT_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_ITEM_NOT_FOUND');
  });
});
