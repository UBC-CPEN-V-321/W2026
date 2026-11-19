import request from 'supertest';

import { createApp } from '../../../src/index';
import type { ItineraryRepository } from '../../../src/itineraries/itineraryRepository';
import type { Itinerary } from '../../../src/itineraries/itineraryTypes';
import type { MockedRepository } from '../../utils/mockedRepository';

const USER_ID = '6705f0000000000000000001';
const ITINERARY_ID = '6705f1000000000000000001';
const ACTIVITY_ID = 'activity-1';
const SEGMENT_ID = 'transportation-1';

const STORED_ITINERARY: Itinerary = {
  id: ITINERARY_ID,
  ownerId: USER_ID,
  name: 'Stored itinerary',
  items: [
    {
      id: ACTIVITY_ID,
      type: 'activity',
      name: 'Museum of Anthropology',
      image: '',
      category: 'art',
      location: '6393 NW Marine Drive, Vancouver, BC',
      startTime: '2027-11-30T17:00:00.000Z',
      endTime: '2027-11-30T18:00:00.000Z',
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
  createdAt: '2026-10-12T12:00:00.000Z',
  updatedAt: '2026-10-12T12:00:00.000Z',
  saved: true,
  inRecommendation: false,
  score: {},
};

/** A new activity that overlaps both stored items (17:30-18:15). */
const CONFLICTING_ACTIVITY = {
  type: 'activity',
  name: 'New activity',
  image: '',
  category: 'outdoors',
  location: 'UBC',
  startTime: '2027-11-30T17:30:00.000Z',
  endTime: '2027-11-30T18:15:00.000Z',
};

const ADD_REPLACING_PATH = `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities?replaceConflicts=true`;
const EDIT_REPLACING_PATH = `/api/v1/users/${USER_ID}/itineraries/${ITINERARY_ID}/activities/${ACTIVITY_ID}?replaceConflicts=true`;
/** Moves the stored activity into the transportation's slot. */
const MOVE_INTO_SEGMENT = { startTime: '2027-11-30T18:10:00.000Z', endTime: '2027-11-30T18:50:00.000Z' };

/** A mocked repository, plus the mock behind its optional replaceEmbeddedItems method. */
function createMockRepository(withReplace = true) {
  const replace = jest.fn<Promise<boolean>, Parameters<NonNullable<ItineraryRepository['replaceEmbeddedItems']>>>();
  const repository = {
    insertItinerary: jest.fn(),
    findItineraryDetails: jest.fn(),
    findItinerary: jest.fn().mockResolvedValue(STORED_ITINERARY),
    findItineraries: jest.fn(),
    updateItineraryDetails: jest.fn(),
    insertEmbeddedActivity: jest.fn(),
    insertEmbeddedTransportationSegment: jest.fn(),
    removeEmbeddedActivity: jest.fn(),
    removeEmbeddedTransportationSegment: jest.fn(),
    updateEmbeddedActivity: jest.fn(),
    updateEmbeddedTransportationSegment: jest.fn(),
    removeItinerary: jest.fn(),
    ...(withReplace ? { replaceEmbeddedItems: replace } : {}),
  } as MockedRepository<ItineraryRepository>;
  return { repository, replace };
}

describe('POST /api/v1/users/:userId/itineraries/:itineraryId/activities?replaceConflicts=true — mocks', () => {
  // Input: an activity overlapping both stored items, with replaceConflicts=true.
  // Expected status code: 201.
  // Expected behavior: the repository replaces both conflicting items with the new activity in one call,
  // and the ordinary insert is not used.
  // Mocked behavior: replaceEmbeddedItems resolves true.
  test('replaces every conflicting item in a single repository call', async () => {
    const { repository, replace } = createMockRepository();
    replace.mockResolvedValue(true);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).post(ADD_REPLACING_PATH).send(CONFLICTING_ACTIVITY);

    expect(response.status).toBe(201);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      USER_ID,
      ITINERARY_ID,
      [ACTIVITY_ID, SEGMENT_ID],
      expect.objectContaining({ ...CONFLICTING_ACTIVITY, id: response.body.activity.id }),
    );
    expect(repository.insertEmbeddedActivity).not.toHaveBeenCalled();
  });

  // Input: the same request, but the replacement write throws.
  // Expected status code: 500 INTERNAL_SERVER_ERROR.
  // Mocked behavior: replaceEmbeddedItems rejects.
  test('returns 500 when the replacement write fails', async () => {
    const { repository, replace } = createMockRepository();
    replace.mockRejectedValue(new Error('write failed'));
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).post(ADD_REPLACING_PATH).send(CONFLICTING_ACTIVITY);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  // Input: the same request, but the itinerary disappears before the replacement.
  // Expected status code: 404 ITINERARY_NOT_FOUND.
  // Mocked behavior: replaceEmbeddedItems resolves false.
  test('returns 404 when the itinerary disappears during replacement', async () => {
    const { repository, replace } = createMockRepository();
    replace.mockResolvedValue(false);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).post(ADD_REPLACING_PATH).send(CONFLICTING_ACTIVITY);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ITINERARY_NOT_FOUND');
  });

  // Input: a conflicting activity with replaceConflicts=true on a repository that has no replace support.
  // Expected status code: 500, and the conflicting items are not touched.
  // Mocked behavior: the repository does not implement the optional replaceEmbeddedItems.
  test('returns 500 when the repository cannot replace items', async () => {
    const { repository } = createMockRepository(false);
    const app = createApp({ itineraryRepository: repository });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).post(ADD_REPLACING_PATH).send(CONFLICTING_ACTIVITY);

    expect(response.status).toBe(500);
    expect(repository.insertEmbeddedActivity).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('PATCH /api/v1/users/:userId/itineraries/:itineraryId/activities/:activityId?replaceConflicts=true — mocks', () => {
  // Input: moving the stored activity into the transportation's slot, with replaceConflicts=true.
  // Expected status code: 200.
  // Expected behavior: the repository removes the conflicting transportation and the activity's own old version,
  // and stores the merged activity; the ordinary update is not used.
  // Mocked behavior: replaceEmbeddedItems resolves true.
  test('removes the conflict and the old version, and stores the merged activity', async () => {
    const { repository, replace } = createMockRepository();
    replace.mockResolvedValue(true);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).patch(EDIT_REPLACING_PATH).send(MOVE_INTO_SEGMENT);

    expect(response.status).toBe(200);
    expect(response.body.activity).toMatchObject({ id: ACTIVITY_ID, ...MOVE_INTO_SEGMENT });
    expect(replace).toHaveBeenCalledWith(
      USER_ID,
      ITINERARY_ID,
      [SEGMENT_ID, ACTIVITY_ID],
      expect.objectContaining({ id: ACTIVITY_ID, name: 'Museum of Anthropology', ...MOVE_INTO_SEGMENT }),
    );
    expect(repository.updateEmbeddedActivity).not.toHaveBeenCalled();
  });

  // Input: the same edit, but the replacement write throws or reports the itinerary missing.
  // Expected status codes: 500 and 404.
  test.each([
    ['throws', () => Promise.reject(new Error('write failed')), 500, 'INTERNAL_SERVER_ERROR'],
    ['resolves false', () => Promise.resolve(false), 404, 'ITINERARY_NOT_FOUND'],
  ])('fails cleanly when the replacement write %s', async (_label, outcome, status, code) => {
    const { repository, replace } = createMockRepository();
    replace.mockImplementation(outcome);
    const app = createApp({ itineraryRepository: repository });

    const response = await request(app).patch(EDIT_REPLACING_PATH).send(MOVE_INTO_SEGMENT);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
  });
});
