import { env } from '../../../src/config/env';
import { fetchLiveEventPage } from '../../../src/events/ticketmaster.client';
import {
  buildEvent,
  buildTicketmasterEvent,
  buildTicketmasterResponse,
  FIXED_NOW,
  KEEP_REAL_TIMERS,
} from '../../utils/eventFixtures';
import {
  jsonStep,
  mockTicketmasterFetch,
  networkErrorStep,
  statusStep,
  type FetchStep,
} from '../../utils/ticketmasterMock';

jest.mock('../../../src/config/env', () => ({
  env: {
    ticketmaster: {
      apiKey: 'test-key',
      baseUrl: 'https://tm.test/discovery/v2',
      city: 'Vancouver',
      stateCode: 'BC',
      countryCode: 'CA',
      pageSize: 200,
    },
  },
}));

const ticketmasterEnv = env.ticketmaster as { apiKey: string | undefined };

/** Valid Ticketmaster venue block, with optional field overrides. */
function embeddedVenue(venue: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    venues: [
      {
        name: 'Orpheum Theatre',
        city: { name: 'Vancouver' },
        location: { longitude: '-123.1207', latitude: '49.2827' },
        ...venue,
      },
    ],
  };
}

function successBody(...events: Record<string, unknown>[]) {
  return jsonStep(buildTicketmasterResponse(events));
}

/** Runs the client and advances fake time so retry waits finish immediately. */
async function fetchPage(page = 0) {
  const outcome = fetchLiveEventPage(page).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
  await jest.advanceTimersByTimeAsync(3000);
  return outcome;
}

beforeEach(() => {
  ticketmasterEnv.apiKey = 'test-key';
  jest.useFakeTimers({
    now: FIXED_NOW,
    doNotFake: KEEP_REAL_TIMERS.filter((name) => !name.endsWith('Timeout')) as never,
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Interface fetchLiveEventPage(page: number): Promise<LiveEventPage>
describe('Mocked: Ticketmaster client fetchLiveEventPage', () => {
  // Input: a Ticketmaster page containing the core event with a decorated title.
  // Expected status code: Not applicable (client function).
  // Expected output: a LiveEvent with every field mapped and lastSyncedAt set to the frozen time.
  // Expected behavior: title cleaned, 16:9 image chosen, coordinates ordered [longitude, latitude].
  // Mocked behavior: global fetch returns the Ticketmaster response; env is mocked.
  test('maps a complete Ticketmaster event', async () => {
    mockTicketmasterFetch(
      successBody(buildTicketmasterEvent({ name: '**Evening   Concert**' })),
    );

    const { value } = await fetchPage();

    expect(value?.events).toEqual([buildEvent({ lastSyncedAt: FIXED_NOW })]);
  });

  // Input: an event whose images have no 16:9 ratio.
  // Expected status code: Not applicable (client function).
  // Expected output: imageUrl equals the first image.
  // Expected behavior: the first image is the fallback.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test('uses the first image when no 16:9 image exists', async () => {
    mockTicketmasterFetch(
      successBody(
        buildTicketmasterEvent({
          images: [
            { ratio: '4_3', url: 'https://example.com/first.jpg' },
            { ratio: '3_2', url: 'https://example.com/second.jpg' },
          ],
        }),
      ),
    );

    const { value } = await fetchPage();

    expect(value?.events[0]?.imageUrl).toBe('https://example.com/first.jpg');
  });

  // Input: an event with no info, end time, classification, or price range.
  // Expected status code: Not applicable (client function).
  // Expected output: the event is returned without description, endDateTime, or price fields; category Other.
  // Expected behavior: optional fields do not invalidate the event.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test('keeps an event whose optional fields are missing', async () => {
    mockTicketmasterFetch(
      successBody(
        buildTicketmasterEvent({
          info: undefined,
          dates: { start: { dateTime: '2026-11-10T20:00:00.000Z' } },
          classifications: undefined,
          priceRanges: undefined,
        }),
      ),
    );

    const { value } = await fetchPage();

    expect(value?.events).toHaveLength(1);
    const event = value?.events[0];
    expect(event?.category).toBe('Other');
    for (const key of ['description', 'endDateTime', 'priceMin', 'priceMax', 'currency']) {
      expect(event).not.toHaveProperty(key);
    }
  });

  // Input: an event with no info but a pleaseNote.
  // Expected status code: Not applicable (client function).
  // Expected output: description equals the pleaseNote text.
  // Expected behavior: pleaseNote is the description fallback.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test('uses pleaseNote as the description when info is absent', async () => {
    mockTicketmasterFetch(
      successBody(
        buildTicketmasterEvent({ info: undefined, pleaseNote: 'Doors open at 7pm.' }),
      ),
    );

    const { value } = await fetchPage();

    expect(value?.events[0]?.description).toBe('Doors open at 7pm.');
  });

  // Input: an end time that is unparseable, equal to the start, or before the start.
  // Expected status code: Not applicable (client function).
  // Expected output: the event is returned without endDateTime.
  // Expected behavior: an invalid end time is dropped, not the event.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test.each([
    ['unparseable', 'not-a-date'],
    ['equal to the start', '2026-11-10T20:00:00.000Z'],
    ['before the start', '2026-11-10T19:00:00.000Z'],
  ])('omits an end time that is %s', async (_label, endDateTime) => {
    mockTicketmasterFetch(
      successBody(
        buildTicketmasterEvent({
          dates: {
            start: { dateTime: '2026-11-10T20:00:00.000Z' },
            end: { dateTime: endDateTime },
          },
        }),
      ),
    );

    const { value } = await fetchPage();

    expect(value?.events).toHaveLength(1);
    expect(value?.events[0]).not.toHaveProperty('endDateTime');
  });

  // Input: an event missing one required value (id, name, URL, image, start, venue name, city, longitude, or latitude).
  // Expected status code: Not applicable (client function).
  // Expected output: an empty event list.
  // Expected behavior: incomplete events are excluded.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test.each([
    ['id', { id: undefined }],
    ['name', { name: undefined }],
    ['ticket URL', { url: undefined }],
    ['image', { images: [] }],
    ['start date and time', { dates: { start: {} } }],
    ['venue name', { _embedded: embeddedVenue({ name: undefined }) }],
    ['venue city', { _embedded: embeddedVenue({ city: undefined }) }],
    ['longitude', { _embedded: embeddedVenue({ location: { latitude: '49.2827' } }) }],
    ['latitude', { _embedded: embeddedVenue({ location: { longitude: '-123.1207' } }) }],
  ])('excludes an event with no %s', async (_label, overrides) => {
    mockTicketmasterFetch(successBody(buildTicketmasterEvent(overrides)));

    const { value } = await fetchPage();

    expect(value?.events).toEqual([]);
  });

  // Input: an event with an invalid start date, longitude, or latitude value.
  // Expected status code: Not applicable (client function).
  // Expected output: an empty event list.
  // Expected behavior: unparseable required values exclude the event.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test.each([
    ['start date', { dates: { start: { dateTime: 'not-a-date' } } }],
    [
      'longitude',
      { _embedded: embeddedVenue({ location: { longitude: 'abc', latitude: '49.2827' } }) },
    ],
    [
      'latitude',
      { _embedded: embeddedVenue({ location: { longitude: '-123.1207', latitude: 'abc' } }) },
    ],
  ])('excludes an event with an invalid %s', async (_label, overrides) => {
    mockTicketmasterFetch(successBody(buildTicketmasterEvent(overrides)));

    const { value } = await fetchPage();

    expect(value?.events).toEqual([]);
  });

  // Input: one invalid event followed by one valid event on the same page.
  // Expected status code: Not applicable (client function).
  // Expected output: only the valid event.
  // Expected behavior: an invalid event does not stop the others being returned.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test('returns the valid events from a page that also has an invalid event', async () => {
    mockTicketmasterFetch(
      successBody(
        buildTicketmasterEvent({ id: 'invalid', url: undefined }),
        buildTicketmasterEvent({ id: 'valid' }),
      ),
    );

    const { value } = await fetchPage();

    expect(value?.events.map((event) => event.externalId)).toEqual(['valid']);
  });

  // Input: a response reporting page number 3 of 7 total pages.
  // Expected status code: Not applicable (client function).
  // Expected output: page 3 and totalPages 7.
  // Expected behavior: page information comes from Ticketmaster.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test('returns the page number and total pages reported by Ticketmaster', async () => {
    mockTicketmasterFetch(
      jsonStep(
        buildTicketmasterResponse([buildTicketmasterEvent()], { number: 3, totalPages: 7 }),
      ),
    );

    const { value } = await fetchPage(3);

    expect(value).toMatchObject({ page: 3, totalPages: 7 });
  });

  // Input: a response with no event array, and a response with an empty event array.
  // Expected status code: Not applicable (client function).
  // Expected output: an empty event list and no error.
  // Expected behavior: missing or empty event arrays are not exceptions.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test.each([
    ['no event array', { page: { number: 0, totalPages: 0, totalElements: 0 } }],
    [
      'an empty event array',
      { _embedded: { events: [] }, page: { number: 0, totalPages: 0, totalElements: 0 } },
    ],
  ])('returns an empty list for a response with %s', async (_label, body) => {
    mockTicketmasterFetch(jsonStep(body));

    const { value, error } = await fetchPage();

    expect(error).toBeUndefined();
    expect(value?.events).toEqual([]);
  });

  // Input: page -1 and page 1.5.
  // Expected status code: Not applicable (client function).
  // Expected output: a rejection with an invalid-page error.
  // Expected behavior: no request is made.
  // Mocked behavior: global fetch is spied on and must not be called.
  test.each([-1, 1.5])('rejects the invalid page %s before requesting', async (page) => {
    const fetchSpy = mockTicketmasterFetch();

    const { error } = await fetchPage(page);

    expect(error).toEqual(new Error(`Invalid Ticketmaster page: ${page}`));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Input: a valid page while the Ticketmaster API key is empty.
  // Expected status code: Not applicable (client function).
  // Expected output: a rejection saying the key is not configured.
  // Expected behavior: no request is made.
  // Mocked behavior: env.ticketmaster.apiKey is empty; global fetch is spied on and must not be called.
  test('rejects before requesting when the API key is missing', async () => {
    ticketmasterEnv.apiKey = '';
    const fetchSpy = mockTicketmasterFetch();

    const { error } = await fetchPage();

    expect(error).toEqual(new Error('TICKETMASTER_API_KEY is not configured'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Input: page 4.
  // Expected status code: Not applicable (client function).
  // Expected output: a mapped page.
  // Expected behavior: one request to the events endpoint with the key, location, page size, page, and sort.
  // Mocked behavior: global fetch returns the Ticketmaster response and records the URL.
  test('requests the events endpoint with the configured search parameters', async () => {
    const fetchSpy = mockTicketmasterFetch(successBody(buildTicketmasterEvent()));

    await fetchPage(4);

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://tm.test/discovery/v2/events.json');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      apikey: 'test-key',
      city: 'Vancouver',
      stateCode: 'BC',
      countryCode: 'CA',
      size: '200',
      page: '4',
      sort: 'date,asc',
    });
  });

  // Input: a request that succeeds on the first attempt.
  // Expected status code: Not applicable (client function).
  // Expected output: the mapped page.
  // Expected behavior: exactly one request is made.
  // Mocked behavior: global fetch returns the Ticketmaster response.
  test('makes one request when the first attempt succeeds', async () => {
    const fetchSpy = mockTicketmasterFetch(successBody(buildTicketmasterEvent()));

    const { value } = await fetchPage();

    expect(value?.events).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Input: a first attempt that fails with HTTP 429, HTTP 500, or a network error, then a success.
  // Expected status code: Not applicable (client function).
  // Expected output: the mapped page.
  // Expected behavior: the failure is retried and exactly two requests are made.
  // Mocked behavior: global fetch returns the scripted failure, then the Ticketmaster response.
  test.each([
    ['HTTP 429', statusStep(429)],
    ['HTTP 500', statusStep(500)],
    ['a network error', networkErrorStep()],
  ])('retries once after %s and returns the page', async (_label, failure) => {
    const fetchSpy = mockTicketmasterFetch(failure, successBody(buildTicketmasterEvent()));

    const { value } = await fetchPage();

    expect(value?.events).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // Input: failures on attempts 1 and 2 (HTTP 503, then a network error), then a success.
  // Expected status code: Not applicable (client function).
  // Expected output: the mapped page.
  // Expected behavior: the third and final attempt succeeds after exactly three requests.
  // Mocked behavior: global fetch returns two failures, then the Ticketmaster response.
  test('succeeds on the third and final attempt', async () => {
    const fetchSpy = mockTicketmasterFetch(
      statusStep(503),
      networkErrorStep(),
      successBody(buildTicketmasterEvent()),
    );

    const { value } = await fetchPage();

    expect(value?.events).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // Input: HTTP 503 on all three attempts.
  // Expected status code: Not applicable (client function).
  // Expected output: a rejection with the original 503 failure.
  // Expected behavior: exactly three requests are made and no fourth is attempted.
  // Mocked behavior: global fetch returns HTTP 503 each time.
  test('rejects with the original failure after three failed attempts', async () => {
    const steps: FetchStep[] = [statusStep(503), statusStep(503), statusStep(503)];
    const fetchSpy = mockTicketmasterFetch(...steps);

    const { error } = await fetchPage();

    expect((error as Error).message).toBe('Ticketmaster request failed with status 503');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // Input: an HTTP 404 response.
  // Expected status code: Not applicable (client function).
  // Expected output: a rejection with the 404 failure.
  // Expected behavior: the failure is not retried; exactly one request is made.
  // Mocked behavior: global fetch returns HTTP 404.
  test('does not retry a non-rate-limit client error', async () => {
    const fetchSpy = mockTicketmasterFetch(statusStep(404));

    const { error } = await fetchPage();

    expect((error as Error).message).toBe('Ticketmaster request failed with status 404');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
