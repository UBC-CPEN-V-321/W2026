import { ItineraryItemNotFoundError, ItineraryNotFoundError, ItineraryTimeConflictError, InvalidItineraryItemError } from '../../../src/itineraries/itineraryErrors';
import type { ItineraryRepository } from '../../../src/itineraries/itineraryRepository';
import { ItineraryService } from '../../../src/itineraries/itineraryService';
import type {
  ActivityItem,
  Itinerary,
  ItineraryDetails,
  TransportationItem,
} from '../../../src/itineraries/itineraryTypes';

const USER_ID = 'user-1';
const ITINERARY_ID = 'itinerary-1';

const ACTIVITY: ActivityItem = {
  id: 'activity-1',
  type: 'activity',
  name: 'Museum of Anthropology',
  image: '',
  location: 'UBC',
  startTime: '2027-11-30T17:00:00.000Z',
  endTime: '2027-11-30T18:00:00.000Z',
};

const TRANSPORTATION: TransportationItem = {
  id: 'transportation-1',
  type: 'transportation',
  mode: 'walking',
  startLocation: 'Museum',
  endLocation: 'UBC Nest',
  distanceMeters: 1200,
  startTime: '2027-11-30T18:00:00.000Z',
  endTime: '2027-11-30T18:30:00.000Z',
};

const ITINERARY: Itinerary = {
  id: ITINERARY_ID,
  ownerId: USER_ID,
  name: 'UBC afternoon',
  items: [ACTIVITY, TRANSPORTATION],
  createdAt: '2026-10-12T12:00:00.000Z',
  updatedAt: '2026-10-12T12:00:00.000Z',
  saved: true,
  inRecommendation: false,
  score: {},
};

const DETAILS: ItineraryDetails = { name: ITINERARY.name };

function createRepository(): jest.Mocked<ItineraryRepository> {
  return {
    insertItinerary: jest.fn().mockResolvedValue(ITINERARY),
    findItineraryDetails: jest.fn().mockResolvedValue(DETAILS),
    findItinerary: jest.fn().mockResolvedValue(ITINERARY),
    findItineraries: jest.fn().mockResolvedValue([ITINERARY]),
    updateItineraryDetails: jest.fn().mockResolvedValue(true),
    insertEmbeddedActivity: jest.fn().mockResolvedValue(true),
    insertEmbeddedTransportationSegment: jest.fn().mockResolvedValue(true),
    removeEmbeddedActivity: jest.fn().mockResolvedValue(true),
    removeEmbeddedTransportationSegment: jest.fn().mockResolvedValue(true),
    updateEmbeddedActivity: jest.fn().mockResolvedValue(true),
    updateEmbeddedTransportationSegment: jest.fn().mockResolvedValue(true),
    replaceEmbeddedItems: jest.fn().mockResolvedValue(true),
    removeItinerary: jest.fn().mockResolvedValue(true),
  };
}

describe('ItineraryService', () => {
  test('creates, reads, lists, and updates itinerary details', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);

    await expect(service.createItinerary(USER_ID, {
      ownerId: USER_ID,
      name: ITINERARY.name,
      items: [],
      saved: true,
      inRecommendation: false,
      score: {},
    })).resolves.toBe(ITINERARY);
    await expect(service.getItineraryDetails(USER_ID, ITINERARY_ID))
      .resolves.toBe(DETAILS);
    await expect(service.getItineraries(USER_ID)).resolves.toEqual([ITINERARY]);
    await expect(service.updateItineraryDetails(
      USER_ID,
      ITINERARY_ID,
      { description: 'Updated' },
    )).resolves.toBe(ITINERARY);
    expect(repository.findItineraries).toHaveBeenCalledWith(USER_ID, {});
    expect(repository.findItinerary).toHaveBeenCalledWith(USER_ID, ITINERARY_ID);
  });

  test('reports missing itinerary reads and failed detail updates', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);
    repository.findItineraryDetails.mockResolvedValue(null);
    await expect(service.getItineraryDetails(USER_ID, ITINERARY_ID))
      .rejects.toBeInstanceOf(ItineraryNotFoundError);

    repository.findItinerary.mockResolvedValue(null);
    await expect(service.getItinerary(USER_ID, ITINERARY_ID))
      .rejects.toBeInstanceOf(ItineraryNotFoundError);

    repository.updateItineraryDetails.mockResolvedValue(false);
    await expect(service.updateItineraryDetails(
      USER_ID,
      ITINERARY_ID,
      { name: 'Missing' },
    )).rejects.toBeInstanceOf(ItineraryNotFoundError);
  });

  test('adds non-conflicting activities and transportation', async () => {
    const repository = createRepository();
    repository.findItinerary.mockResolvedValue({ ...ITINERARY, items: [] });
    const service = new ItineraryService(repository);
    const activityInput = {
      type: 'activity' as const,
      name: 'Nitobe Garden',
      image: '',
      location: 'UBC',
      startTime: '2027-11-30T19:00:00.000Z',
      endTime: '2027-11-30T20:00:00.000Z',
    };
    const transportationInput = {
      type: 'transportation' as const,
      mode: 'walking' as const,
      startLocation: 'UBC',
      endLocation: 'Nest',
      distanceMeters: 100,
      startTime: '2027-11-30T20:00:00.000Z',
      endTime: '2027-11-30T20:30:00.000Z',
    };

    await expect(service.addActivity(USER_ID, ITINERARY_ID, activityInput))
      .resolves.toMatchObject({ ...activityInput, id: expect.any(String) });
    await expect(service.addTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      transportationInput,
    )).resolves.toMatchObject({
      ...transportationInput,
      id: expect.any(String),
    });
  });

  test('rejects overlapping additions unless the repository can replace conflicts', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);
    const overlapping = {
      type: 'activity' as const,
      name: 'Overlapping activity',
      image: '',
      location: 'UBC',
      startTime: '2027-11-30T17:30:00.000Z',
      endTime: '2027-11-30T17:45:00.000Z',
    };

    await expect(service.addActivity(USER_ID, ITINERARY_ID, overlapping))
      .rejects.toBeInstanceOf(ItineraryTimeConflictError);
    const repositoryWithoutReplacement = createRepository();
    delete repositoryWithoutReplacement.replaceEmbeddedItems;
    await expect(new ItineraryService(repositoryWithoutReplacement).addActivity(
      USER_ID,
      ITINERARY_ID,
      overlapping,
      true,
    )).rejects.toThrow('The itinerary repository does not support replacement.');

    await expect(service.addActivity(
      USER_ID,
      ITINERARY_ID,
      overlapping,
      true,
    )).resolves.toMatchObject({ name: overlapping.name });
    expect(repository.replaceEmbeddedItems).toHaveBeenCalledWith(
      USER_ID,
      ITINERARY_ID,
      [ACTIVITY.id],
      expect.objectContaining({ type: 'activity' }),
    );
  });

  test('adds and removes transportation with conflict replacement', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);
    const overlapping = {
      type: 'transportation' as const,
      mode: 'cycling' as const,
      startLocation: 'Museum',
      endLocation: 'Nest',
      distanceMeters: 500,
      startTime: '2027-11-30T18:10:00.000Z',
      endTime: '2027-11-30T18:20:00.000Z',
    };

    await expect(service.addTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      overlapping,
      true,
    )).resolves.toMatchObject({ ...overlapping, id: expect.any(String) });
    expect(repository.replaceEmbeddedItems).toHaveBeenCalledWith(
      USER_ID,
      ITINERARY_ID,
      [TRANSPORTATION.id],
      expect.objectContaining({ type: 'transportation' }),
    );

    await expect(service.removeActivity(USER_ID, ITINERARY_ID, ACTIVITY.id))
      .resolves.toBe(true);
    await expect(service.removeTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      TRANSPORTATION.id,
    )).resolves.toBe(true);
  });

  test('rejects removals for missing or unsaved items', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);

    await expect(service.removeActivity(USER_ID, ITINERARY_ID, 'missing'))
      .rejects.toBeInstanceOf(ItineraryItemNotFoundError);
    repository.findItinerary.mockResolvedValue({ ...ITINERARY, saved: false });
    await expect(service.removeTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      TRANSPORTATION.id,
    )).rejects.toBeInstanceOf(ItineraryNotFoundError);
  });

  test('updates activities and transportation while preserving their other fields', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);

    await expect(service.updateActivity(
      USER_ID,
      ITINERARY_ID,
      ACTIVITY.id,
      { name: 'Updated museum' },
    )).resolves.toMatchObject({ ...ACTIVITY, name: 'Updated museum' });
    await expect(service.updateTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      TRANSPORTATION.id,
      { mode: 'transit' },
    )).resolves.toMatchObject({ ...TRANSPORTATION, mode: 'transit' });
  });

  test('rejects invalid updates, missing items, and failed repository writes', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);

    await expect(service.updateActivity(
      USER_ID,
      ITINERARY_ID,
      ACTIVITY.id,
      { endTime: '2027-11-30T16:00:00.000Z' },
    )).rejects.toBeInstanceOf(InvalidItineraryItemError);
    await expect(service.updateTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      TRANSPORTATION.id,
      { endTime: '2027-11-30T17:00:00.000Z' },
    )).rejects.toBeInstanceOf(InvalidItineraryItemError);

    await expect(service.updateActivity(
      USER_ID,
      ITINERARY_ID,
      TRANSPORTATION.id,
      { name: 'Wrong type' },
    )).rejects.toBeInstanceOf(ItineraryItemNotFoundError);

    repository.updateEmbeddedActivity.mockResolvedValue(false);
    await expect(service.updateActivity(
      USER_ID,
      ITINERARY_ID,
      ACTIVITY.id,
      { name: 'Gone' },
    )).rejects.toBeInstanceOf(ItineraryItemNotFoundError);
    repository.updateEmbeddedTransportationSegment.mockResolvedValue(false);
    await expect(service.updateTransportationSegment(
      USER_ID,
      ITINERARY_ID,
      TRANSPORTATION.id,
      { mode: 'transit' },
    )).rejects.toBeInstanceOf(ItineraryItemNotFoundError);
  });

  test('deletes an itinerary and reports failed writes or replacements', async () => {
    const repository = createRepository();
    const service = new ItineraryService(repository);
    await expect(service.deleteItinerary(USER_ID, ITINERARY_ID)).resolves.toBe(true);

    repository.removeItinerary.mockResolvedValue(false);
    await expect(service.deleteItinerary(USER_ID, ITINERARY_ID))
      .rejects.toBeInstanceOf(ItineraryNotFoundError);

    const replaceEmbeddedItems = jest.fn().mockResolvedValue(false);
    repository.replaceEmbeddedItems = replaceEmbeddedItems;
    await expect(service.addActivity(
      USER_ID,
      ITINERARY_ID,
      {
        type: 'activity',
        name: 'Overlap',
        image: '',
        location: 'UBC',
        startTime: '2027-11-30T17:30:00.000Z',
        endTime: '2027-11-30T17:45:00.000Z',
      },
      true,
    )).rejects.toBeInstanceOf(ItineraryNotFoundError);
  });
});
