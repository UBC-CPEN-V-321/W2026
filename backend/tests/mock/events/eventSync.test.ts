import { syncEvents } from '../../../src/events/eventSync';
import type { LiveEvent } from '../../../src/events/eventTypes';
import { fetchLiveEventPage } from '../../../src/events/ticketmaster/ticketmaster.client';
import {
  buildEvent,
  createMockEventRepository,
  FIXED_NOW,
} from '../../utils/eventFixtures';

jest.mock('../../../src/config/env', () => ({
  env: { mongodbUri: 'mongodb://unused', ticketmaster: { pageSize: 200 } },
}));
jest.mock('../../../src/events/ticketmaster/ticketmaster.client');

const mockedFetchPage = jest.mocked(fetchLiveEventPage);

// With pageSize 200, the 1,000-result cap allows at most 5 pages.
const PAGE_CAP = 5;
const PAGE_DELAY_MS = 500;
const NO_UPSERT = { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };

function pageOf(page: number, totalPages: number, events: LiveEvent[]) {
  return { events, page, totalPages };
}

function eventsForPage(page: number): LiveEvent[] {
  return [0, 1].map((n) => buildEvent({ externalId: `page-${page}-event-${n}` }));
}

function setUpRepository() {
  const repository = createMockEventRepository();
  repository.upsertEvents.mockResolvedValue(NO_UPSERT);
  repository.deleteExpiredEvents.mockResolvedValue(0);
  repository.deleteEventsNotSyncedSince.mockResolvedValue(0);
  return repository;
}

/** Serves `totalPages` pages of two events each, from page 0. */
function serveCatalogue(totalPages: number) {
  mockedFetchPage.mockImplementation(async (page) =>
    pageOf(page, totalPages, eventsForPage(page)),
  );
}

/** Runs syncEvents and advances fake time so the delays between pages finish at once. */
async function runSync(repository: ReturnType<typeof setUpRepository>) {
  const outcome = syncEvents(repository).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
  await jest.advanceTimersByTimeAsync(PAGE_CAP * PAGE_DELAY_MS);
  return outcome;
}

beforeEach(() => {
  jest.useFakeTimers({ now: FIXED_NOW });
  mockedFetchPage.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

// Interface syncEvents(repository: EventRepository): Promise<SyncResult>
describe('Mocked: syncEvents', () => {
  // Input: a catalogue reporting zero pages and no events.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: pageCount 1, eventCount 0, and staleCount 0.
  // Expected behavior: upsertEvents is called once with []; expired cleanup runs; stale cleanup does not.
  // Mocked behavior: fetchLiveEventPage returns an empty page; every repository method is mocked.
  test('stores an empty page and skips stale cleanup for an empty catalogue', async () => {
    const repository = setUpRepository();
    mockedFetchPage.mockResolvedValue(pageOf(0, 0, []));

    const { value } = await runSync(repository);

    expect(value).toMatchObject({ pageCount: 1, eventCount: 0, staleCount: 0 });
    expect(repository.upsertEvents).toHaveBeenCalledTimes(1);
    expect(repository.upsertEvents).toHaveBeenCalledWith([]);
    expect(repository.deleteExpiredEvents).toHaveBeenCalledTimes(1);
    expect(repository.deleteEventsNotSyncedSince).not.toHaveBeenCalled();
  });

  // Input: a catalogue with one page of one event.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: every count from the repository results.
  // Expected behavior: page 0 only is fetched, upserted once, then expired and stale cleanup both run.
  // Mocked behavior: fetchLiveEventPage returns one page; repository methods return distinct counts.
  test('fetches, stores, and cleans up a single-page catalogue', async () => {
    const repository = setUpRepository();
    const events = [buildEvent()];
    mockedFetchPage.mockResolvedValue(pageOf(0, 1, events));
    repository.upsertEvents.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 2,
      upsertedCount: 3,
    });
    repository.deleteExpiredEvents.mockResolvedValue(4);
    repository.deleteEventsNotSyncedSince.mockResolvedValue(5);

    const { value } = await runSync(repository);

    expect(value).toEqual({
      pageCount: 1,
      eventCount: 1,
      matchedCount: 1,
      modifiedCount: 2,
      upsertedCount: 3,
      expiredCount: 4,
      staleCount: 5,
    });
    expect(mockedFetchPage.mock.calls).toEqual([[0]]);
    expect(repository.upsertEvents).toHaveBeenCalledWith(events);
  });

  // Input: a catalogue of 3 pages (below the cap), each with two events.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: pageCount 3, eventCount 6, and the summed upsert counts.
  // Expected behavior: pages 0, 1, 2 are fetched in order and each page is upserted once.
  // Mocked behavior: fetchLiveEventPage serves the pages; upsertEvents returns different counts per page.
  test('accumulates counts across several pages', async () => {
    const repository = setUpRepository();
    serveCatalogue(3);
    repository.upsertEvents
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 2 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1, upsertedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 2, modifiedCount: 0, upsertedCount: 0 });

    const { value } = await runSync(repository);

    expect(value).toMatchObject({
      pageCount: 3,
      eventCount: 6,
      matchedCount: 3,
      modifiedCount: 1,
      upsertedCount: 3,
    });
    expect(mockedFetchPage.mock.calls).toEqual([[0], [1], [2]]);
    expect(repository.upsertEvents.mock.calls).toEqual([
      [eventsForPage(0)],
      [eventsForPage(1)],
      [eventsForPage(2)],
    ]);
  });

  // Input: a catalogue of exactly 5 pages (the cap).
  // Expected status code: Not applicable (synchronization function).
  // Expected output: pageCount 5.
  // Expected behavior: all 5 pages are fetched and stale cleanup runs.
  // Mocked behavior: fetchLiveEventPage serves 5 pages; repository methods are mocked.
  test('fetches a catalogue exactly at the page cap and runs stale cleanup', async () => {
    const repository = setUpRepository();
    serveCatalogue(PAGE_CAP);

    const { value } = await runSync(repository);

    expect(value?.pageCount).toBe(PAGE_CAP);
    expect(mockedFetchPage).toHaveBeenCalledTimes(PAGE_CAP);
    expect(repository.deleteEventsNotSyncedSince).toHaveBeenCalledTimes(1);
  });

  // Input: a catalogue reporting 6 pages (over the cap).
  // Expected status code: Not applicable (synchronization function).
  // Expected output: pageCount 5 and staleCount 0.
  // Expected behavior: page 5 is never requested, stale cleanup is skipped, expired cleanup still runs.
  // Mocked behavior: fetchLiveEventPage serves pages for a 6-page catalogue; repository methods are mocked.
  test('stops at the page cap and keeps stale events for a partial catalogue', async () => {
    const repository = setUpRepository();
    serveCatalogue(PAGE_CAP + 1);
    repository.deleteEventsNotSyncedSince.mockResolvedValue(99);

    const { value } = await runSync(repository);

    expect(value).toMatchObject({ pageCount: PAGE_CAP, staleCount: 0 });
    expect(mockedFetchPage.mock.calls.map(([page]) => page)).toEqual([0, 1, 2, 3, 4]);
    expect(repository.deleteEventsNotSyncedSince).not.toHaveBeenCalled();
    expect(repository.deleteExpiredEvents).toHaveBeenCalledTimes(1);
  });

  // Input: a 3-page catalogue, with 500 ms waited between pages.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: not applicable.
  // Expected behavior: expired cleanup receives the current time (1,000 ms after start); stale cleanup receives the sync start time.
  // Mocked behavior: fetchLiveEventPage serves 3 pages; repository methods are mocked; Date is frozen.
  test('passes the current time to expired cleanup and the start time to stale cleanup', async () => {
    const repository = setUpRepository();
    serveCatalogue(3);

    await runSync(repository);

    expect(repository.deleteExpiredEvents).toHaveBeenCalledWith(
      new Date(FIXED_NOW.getTime() + 2 * PAGE_DELAY_MS),
    );
    expect(repository.deleteEventsNotSyncedSince).toHaveBeenCalledWith(FIXED_NOW);
  });

  // Input: the first page fetch fails.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: a rejection with the original error.
  // Expected behavior: nothing is stored and no cleanup runs.
  // Mocked behavior: fetchLiveEventPage rejects on page 0.
  test('rejects without storing or cleaning up when the first page fails', async () => {
    const repository = setUpRepository();
    const failure = new Error('Ticketmaster unavailable');
    mockedFetchPage.mockRejectedValue(failure);

    const { error } = await runSync(repository);

    expect(error).toBe(failure);
    expect(mockedFetchPage).toHaveBeenCalledTimes(1);
    expect(repository.upsertEvents).not.toHaveBeenCalled();
    expect(repository.deleteExpiredEvents).not.toHaveBeenCalled();
    expect(repository.deleteEventsNotSyncedSince).not.toHaveBeenCalled();
  });

  // Input: page 0 succeeds and the page 1 fetch fails, in a 3-page catalogue.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: a rejection with the original error.
  // Expected behavior: page 0 stays stored, page 2 is never requested, and no cleanup runs.
  // Mocked behavior: fetchLiveEventPage serves page 0, then rejects on page 1.
  test('keeps the stored first page and stops when a later fetch fails', async () => {
    const repository = setUpRepository();
    const failure = new Error('Ticketmaster unavailable');
    mockedFetchPage
      .mockResolvedValueOnce(pageOf(0, 3, eventsForPage(0)))
      .mockRejectedValueOnce(failure);

    const { error } = await runSync(repository);

    expect(error).toBe(failure);
    expect(mockedFetchPage.mock.calls).toEqual([[0], [1]]);
    expect(repository.upsertEvents).toHaveBeenCalledTimes(1);
    expect(repository.deleteExpiredEvents).not.toHaveBeenCalled();
    expect(repository.deleteEventsNotSyncedSince).not.toHaveBeenCalled();
  });

  // Input: a 3-page catalogue where storing page 1 fails.
  // Expected status code: Not applicable (synchronization function).
  // Expected output: a rejection with the original error.
  // Expected behavior: page 2 is never requested and no cleanup runs.
  // Mocked behavior: upsertEvents succeeds for page 0, then rejects for page 1.
  test('stops without cleanup when storing a page fails', async () => {
    const repository = setUpRepository();
    const failure = new Error('database unavailable');
    serveCatalogue(3);
    repository.upsertEvents
      .mockResolvedValueOnce(NO_UPSERT)
      .mockRejectedValueOnce(failure);

    const { error } = await runSync(repository);

    expect(error).toBe(failure);
    expect(mockedFetchPage.mock.calls).toEqual([[0], [1]]);
    expect(repository.deleteExpiredEvents).not.toHaveBeenCalled();
    expect(repository.deleteEventsNotSyncedSince).not.toHaveBeenCalled();
  });
});
