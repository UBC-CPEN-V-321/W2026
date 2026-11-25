import 'dotenv/config';

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';

import { Db, MongoClient } from 'mongodb';

import type { EventDao as EventDaoType } from '../../../src/events/eventDao';
import type { fetchLiveEventPage as FetchLiveEventPage } from '../../../src/events/ticketmaster.client';
import type { syncEvents as SyncEvents } from '../../../src/events/eventSync';
import { buildEvent, buildTicketmasterEvent, buildTicketmasterResponse } from '../../utils/eventFixtures';

jest.setTimeout(60_000);

// A fixed name, reused every run, so test databases never pile up on the shared cluster.
const DATABASE_NAME = 'eubc_events_sync';
const DAY_MS = 86_400_000;

type Handler = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
) => void;

let server: http.Server;
let handler: Handler;
const requestedUrls: string[] = [];

let client: MongoClient;
let database: Db;
let eventDao: EventDaoType;
let fetchLiveEventPage: typeof FetchLiveEventPage;
let syncEvents: typeof SyncEvents;

/** A raw Ticketmaster event that starts `days` days from now. */
function upcomingTicketmasterEvent(id: string, days: number) {
  const start = new Date(Date.now() + days * DAY_MS);
  return buildTicketmasterEvent({
    id,
    name: `Event ${id}`,
    dates: {
      start: { dateTime: start.toISOString() },
      end: { dateTime: new Date(start.getTime() + 2 * 3_600_000).toISOString() },
    },
  });
}

function respondWithJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function pageParameter(request: http.IncomingMessage): number {
  const url = new URL(request.url ?? '', 'http://localhost');
  return Number(url.searchParams.get('page') ?? '0');
}

beforeAll(async () => {
  // A local HTTP server stands in for Ticketmaster, so the client makes real HTTP requests.
  server = http.createServer((request, response) => {
    requestedUrls.push(request.url ?? '');
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  // The env module reads these when it is first loaded, so set them before loading the sources.
  process.env.TICKETMASTER_API_KEY = 'test-key';
  process.env.TICKETMASTER_BASE_URL = `http://127.0.0.1:${port}/discovery/v2`;
  ({ fetchLiveEventPage } = jest.requireActual<typeof import('../../../src/events/ticketmaster.client')>(
    '../../../src/events/ticketmaster.client',
  ));
  ({ syncEvents } = jest.requireActual<typeof import('../../../src/events/eventSync')>(
    '../../../src/events/eventSync',
  ));
  const { EventDao } = jest.requireActual<typeof import('../../../src/events/eventDao')>(
    '../../../src/events/eventDao',
  );

  const uri = process.env.MONGODB_URI;
  if (uri === undefined || uri.trim() === '') {
    throw new Error('MONGODB_URI is required for no-mock tests.');
  }
  client = new MongoClient(uri, { runtimeAdapters: { os }, serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  database = client.db(DATABASE_NAME);
  eventDao = new EventDao(database);
  await eventDao.createIndexes();
});

beforeEach(async () => {
  requestedUrls.length = 0;
  handler = (_request, response) => { respondWithJson(response, 200, buildTicketmasterResponse([])); };
  await database.collection('liveevents').deleteMany({});
});

afterAll(async () => {
  try {
    await database.collection('liveevents').deleteMany({});
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  }
});

// Supporting tests for the Ticketmaster client, run over real HTTP against a local stand-in server.
describe('Unmocked: Ticketmaster client', () => {
  // Input: page 2 requested from a server that returns one complete event.
  // Expected output: the mapped event and the page details.
  // Expected behavior: one request with the API key, search area, page size, page and sort order.
  test('requests the configured page and maps the response', async () => {
    handler = (_request, response) => {
      respondWithJson(
        response,
        200,
        buildTicketmasterResponse([buildTicketmasterEvent()], { number: 2, totalPages: 7 }),
      );
    };

    const result = await fetchLiveEventPage(2);

    const query = new URL(requestedUrls[0] ?? '', 'http://localhost').searchParams;
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain('/discovery/v2/events.json');
    expect(Object.fromEntries(query)).toEqual({
      apikey: 'test-key',
      stateCode: 'BC',
      countryCode: 'CA',
      size: '200',
      page: '2',
      sort: 'date,asc',
    });
    expect(result).toMatchObject({ page: 2, totalPages: 7 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalId: buildEvent().externalId,
      title: buildEvent().title,
      venueName: buildEvent().venueName,
      category: 'Music',
      priceMin: 30,
      priceMax: 60,
    });
  });

  // Input: a response with no `page` object, and one event missing required data.
  // Expected output: an empty page with defaults, with the invalid event skipped.
  // Expected behavior: missing pagination falls back to the requested page and zero totals.
  test('uses defaults when Ticketmaster omits pagination and skips invalid events', async () => {
    handler = (_request, response) => {
      respondWithJson(response, 200, { _embedded: { events: [{ id: 'incomplete' }] } });
    };

    const result = await fetchLiveEventPage(3);

    expect(result).toEqual({ events: [], page: 3, totalPages: 0 });
  });

  // Input: HTTP 503 on the first attempt, then a successful response.
  // Expected behavior: the client waits and retries, and returns the second response.
  test('retries after a server error and then succeeds', async () => {
    let calls = 0;
    handler = (_request, response) => {
      calls += 1;
      if (calls === 1) {
        respondWithJson(response, 503, {});
        return;
      }
      respondWithJson(response, 200, buildTicketmasterResponse([buildTicketmasterEvent()]));
    };

    const result = await fetchLiveEventPage(0);

    expect(calls).toBe(2);
    expect(result.events).toHaveLength(1);
  });

  // Input: HTTP 503 on every attempt.
  // Expected output: a rejection with the original 503 failure.
  // Expected behavior: exactly three requests are made.
  test('rejects after three failed attempts', async () => {
    handler = (_request, response) => { respondWithJson(response, 503, {}); };

    await expect(fetchLiveEventPage(0)).rejects.toThrow(
      'Ticketmaster request failed with status 503',
    );
    expect(requestedUrls).toHaveLength(3);
  });

  // Input: HTTP 400 (a client error that a retry cannot fix).
  // Expected behavior: rejected immediately with a single request.
  test('does not retry a client error', async () => {
    handler = (_request, response) => { respondWithJson(response, 400, {}); };

    await expect(fetchLiveEventPage(0)).rejects.toThrow(
      'Ticketmaster request failed with status 400',
    );
    expect(requestedUrls).toHaveLength(1);
  });
});

// Supporting tests for event synchronization against a real database and the stand-in server.
describe('Unmocked: syncEvents', () => {
  // Input: a two-page catalogue, plus one expired and one stale event already stored.
  // Expected output: counts for two pages, three events stored, one expired and one stale removal.
  // Expected behavior: the feed's events are stored; old events not in the feed are removed.
  test('stores every page and removes expired and stale events', async () => {
    const oldSync = new Date(Date.now() - 10 * DAY_MS);
    await eventDao.upsertEvents([
      buildEvent({
        externalId: 'expired',
        startDateTime: new Date(Date.now() - 3 * DAY_MS),
        endDateTime: new Date(Date.now() - 3 * DAY_MS + 3_600_000),
        lastSyncedAt: oldSync,
      }),
      buildEvent({
        externalId: 'stale',
        startDateTime: new Date(Date.now() + 5 * DAY_MS),
        endDateTime: new Date(Date.now() + 5 * DAY_MS + 3_600_000),
        lastSyncedAt: oldSync,
      }),
    ]);
    handler = (request, response) => {
      const page = pageParameter(request);
      const events =
        page === 0
          ? [upcomingTicketmasterEvent('a', 3), upcomingTicketmasterEvent('b', 4)]
          : [upcomingTicketmasterEvent('c', 5)];
      respondWithJson(
        response,
        200,
        buildTicketmasterResponse(events, { number: page, totalPages: 2 }),
      );
    };

    const result = await syncEvents(eventDao);

    expect(result).toMatchObject({
      pageCount: 2,
      eventCount: 3,
      upsertedCount: 3,
      expiredCount: 1,
      staleCount: 1,
    });
    const stored = (await database.collection('liveevents').find({}).toArray())
      .map((doc) => doc.externalId as string)
      .sort();
    expect(stored).toEqual(['a', 'b', 'c']);
  });

  // Input: syncing the same catalogue twice.
  // Expected output: the second run updates existing events instead of adding new ones.
  // Expected behavior: no duplicates are created.
  test('does not duplicate events when run twice', async () => {
    handler = (_request, response) => {
      respondWithJson(
        response,
        200,
        buildTicketmasterResponse([upcomingTicketmasterEvent('a', 3)]),
      );
    };

    await syncEvents(eventDao);
    const second = await syncEvents(eventDao);

    expect(second).toMatchObject({ eventCount: 1, upsertedCount: 0, matchedCount: 1 });
    expect(await database.collection('liveevents').countDocuments()).toBe(1);
  });

  // Input: Ticketmaster returns an empty catalogue.
  // Expected output: nothing stored, and stale cleanup skipped.
  // Expected behavior: events already stored are kept, so a bad response cannot wipe the data.
  test('keeps stored events when the catalogue is empty', async () => {
    await eventDao.upsertEvents([
      buildEvent({
        externalId: 'kept',
        startDateTime: new Date(Date.now() + 5 * DAY_MS),
        endDateTime: new Date(Date.now() + 5 * DAY_MS + 3_600_000),
        lastSyncedAt: new Date(Date.now() - 10 * DAY_MS),
      }),
    ]);

    handler = (_request, response) => {
      respondWithJson(response, 200, buildTicketmasterResponse([], { totalPages: 0 }));
    };

    const result = await syncEvents(eventDao);

    expect(result).toMatchObject({ eventCount: 0, staleCount: 0 });
    expect(await database.collection('liveevents').countDocuments()).toBe(1);
  });

  // Input: Ticketmaster fails on every attempt.
  // Expected output: a rejection, and the stored events are left untouched.
  test('rejects and keeps stored data when Ticketmaster is down', async () => {
    await eventDao.upsertEvents([
      buildEvent({
        externalId: 'kept',
        startDateTime: new Date(Date.now() + 5 * DAY_MS),
        endDateTime: new Date(Date.now() + 5 * DAY_MS + 3_600_000),
      }),
    ]);
    handler = (_request, response) => { respondWithJson(response, 503, {}); };

    await expect(syncEvents(eventDao)).rejects.toThrow('status 503');
    expect(await database.collection('liveevents').countDocuments()).toBe(1);
  });
});
