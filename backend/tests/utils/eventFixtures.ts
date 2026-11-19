// Shared Live Events test data: the oracle's core event, a user, and raw Ticketmaster payloads.

import { ObjectId } from 'mongodb';

import type { EventRepository } from '../../src/events/eventRepository';
import type { LiveEvent } from '../../src/events/eventTypes';
import type { MockedRepository } from './mockedRepository';

/** Fixed system time for recommendation-score assertions (5 days before the core event). */
export const FIXED_NOW = new Date('2026-11-05T20:00:00.000Z');

/** Fixed `lastSyncedAt` value so stored events are deterministic. */
export const FIXED_SYNCED_AT = new Date('2026-11-01T00:00:00.000Z');

/**
 * `doNotFake` list for `jest.useFakeTimers` that freezes only Date.
 * Every other timer stays real so MongoDB and HTTP keep working.
 */
export const KEEP_REAL_TIMERS: string[] = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
];

/** Coordinates of the core event, also used as the user's request location. */
export const CORE_LONGITUDE = -123.1207;
export const CORE_LATITUDE = 49.2827;

/** Builds the core Live Events test event, with optional field overrides. */
export function buildEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    externalId: 'tm-event-1',
    title: 'Evening Concert',
    description: 'Live music in Vancouver.',
    imageUrl: 'https://example.com/event.jpg',
    startDateTime: new Date('2026-11-10T20:00:00.000Z'),
    endDateTime: new Date('2026-11-10T22:00:00.000Z'),
    venueName: 'Orpheum Theatre',
    city: 'Vancouver',
    location: { type: 'Point', coordinates: [CORE_LONGITUDE, CORE_LATITUDE] },
    category: 'Music',
    ticketUrl: 'https://example.com/tickets',
    priceMin: 30,
    priceMax: 60,
    currency: 'CAD',
    lastSyncedAt: FIXED_SYNCED_AT,
    ...overrides,
  };
}

/**
 * Builds a user document with a stored interest preference.
 * @param interest Interest stored on the user (defaults to live_music).
 */
export function buildUserDocument(
  interest = 'live_music',
  id: ObjectId = new ObjectId(),
) {
  const now = new Date(FIXED_SYNCED_AT);
  return {
    _id: id,
    googleSubject: `events-test-${id.toHexString()}`,
    email: `events-${id.toHexString()}@student.ubc.ca`,
    displayName: 'Events Test User',
    start_location: 'UBC Bus Exchange',
    preferences: {
      transportation: { mode: 'transit' },
      budget: 'balanced',
      interest,
    },
    create_at: now,
    updated_at: now,
  };
}

/** Raw Ticketmaster event shape matching the core event (all supported fields). */
export function buildTicketmasterEvent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'tm-event-1',
    name: 'Evening Concert',
    info: 'Live music in Vancouver.',
    url: 'https://example.com/tickets',
    images: [
      { ratio: '4_3', url: 'https://example.com/other.jpg' },
      { ratio: '16_9', url: 'https://example.com/event.jpg' },
    ],
    dates: {
      start: { dateTime: '2026-11-10T20:00:00.000Z' },
      end: { dateTime: '2026-11-10T22:00:00.000Z' },
    },
    classifications: [{ primary: true, segment: { name: 'Music' } }],
    priceRanges: [{ min: 30, max: 60, currency: 'CAD' }],
    _embedded: {
      venues: [
        {
          name: 'Orpheum Theatre',
          city: { name: 'Vancouver' },
          location: {
            longitude: String(CORE_LONGITUDE),
            latitude: String(CORE_LATITUDE),
          },
        },
      ],
    },
    ...overrides,
  };
}

/** Raw Ticketmaster response body for one page of events. */
export function buildTicketmasterResponse(
  events: Array<Record<string, unknown>>,
  page: { number?: number; totalPages?: number; totalElements?: number } = {},
): Record<string, unknown> {
  return {
    ...(events.length === 0 ? {} : { _embedded: { events } }),
    page: {
      number: page.number ?? 0,
      totalPages: page.totalPages ?? 1,
      totalElements: page.totalElements ?? events.length,
    },
  };
}

/** Event repository whose every method is a jest mock. */
export function createMockEventRepository(): MockedRepository<EventRepository> {
  return {
    createIndexes: jest.fn(),
    upsertEvents: jest.fn(),
    deleteExpiredEvents: jest.fn(),
    deleteEventsNotSyncedSince: jest.fn(),
    findNearbyUpcomingEvents: jest.fn(),
  };
}
