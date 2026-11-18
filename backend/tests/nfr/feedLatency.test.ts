import type { Server } from 'node:http';

import request from 'supertest';

import { env } from '../../src/config/env';
import { CONDITIONS, type PostField, type RequestField } from '../../src/models/common';
import { ME, OTHER, bearer, clearDealData, makeListing, makeRequest } from '../helpers/dealFixtures';
import { startTestApp, stopTestApp } from '../helpers/testApp';
import { createTestStore, type TestStore } from '../helpers/testStore';

// NFR 1: the first page of the ranked feed returns within 1 second for 95% of requests,
// with 1,000 open candidate posts in the same category, not counting the travel-time lookup.
const CANDIDATES = 1000;
const REQUESTS = 100;
const PERCENTILE = 0.95;
const LATENCY_LIMIT_MS = 1000;
const PAGE_SIZE = 20;
// Inserting in batches keeps the setup quick without opening 1,000 connections at once.
const INSERT_BATCH = 100;
const BRANDS = ['ikea', 'hay', 'muji', 'herman miller'];
const COLOURS = ['oak', 'black', 'white', 'red', 'blue'];

let mongo: TestStore;
let app: Server;

beforeAll(async () => {
  mongo = await createTestStore();
  app = await startTestApp(mongo.store);
});

afterAll(async () => {
  await stopTestApp(app);
  await mongo.dropAndClose();
});

beforeEach(async () => {
  await clearDealData(mongo.db);
  // NFR 1 excludes the travel-time lookup, which NFR 2 bounds separately.
  jest.replaceProperty(env, 'orsApiKey', undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function soft(key: string, value: string | number, importance: number): RequestField {
  return { key, label: key, kind: 'builtin', type: typeof value === 'number' ? 'number' : 'text', value, hard: false, importance };
}

function textField(key: string, value: string): PostField {
  return { key, label: key, kind: 'builtin', type: 'text', value };
}

// Listing number i: every one meets the request's hard requirements, so all 1,000 are ranked,
// but prices, conditions, places, brands and colours vary so the scores differ.
function candidate(i: number): Parameters<typeof makeListing>[2] {
  return {
    price: 10 + (i % 90),
    condition: CONDITIONS[i % CONDITIONS.length] ?? 'good',
    // A grid about 3.6 km by 1.5 km around the request, inside its 10 km radius.
    location: { type: 'Point', coordinates: [-123.25 + (i % 50) * 0.001, 49.26 + Math.floor(i / 50) * 0.0007] },
    listingFields: [textField('brand', BRANDS[i % BRANDS.length] ?? 'ikea'), textField('colour', COLOURS[i % COLOURS.length] ?? 'oak')],
  };
}

// A failed insert rejects the returned promise, which fails the test.
const insertCandidates = async (): Promise<void> => {
  for (let start = 0; start < CANDIDATES; start += INSERT_BATCH) {
    const batch = Array.from({ length: INSERT_BATCH }, (_unused, offset) => makeListing(mongo.store, OTHER, candidate(start + offset)));
    await Promise.all(batch);
  }
};

function percentile(sortedMs: number[], fraction: number): number {
  const index = Math.min(sortedMs.length - 1, Math.ceil(fraction * sortedMs.length) - 1);
  return sortedMs.at(index) ?? Number.NaN;
}

// Interface GET /api/feed
describe('NFR 1: GET /api/feed ranking latency', () => {
  // Input: my request for a chair with a hard maximum of $100 and soft preferences for price, condition, brand and
  // colour, and 1,000 of another user's open chair listings that all meet the hard requirements
  // Expected status code: 200 for each of 100 requests for the first page
  // Expected behavior: every candidate is filtered and ranked on each request, and 95% of requests finish within 1 second
  // Expected output: 20 ranked matches per page, with nextCursor "20"
  test('First Page Within 1 Second For 95% Of Requests With 1,000 Candidates', async () => {
    await insertCandidates();
    const buyerRequest = await makeRequest(mongo.store, ME, {
      requestFields: [
        { key: 'price', label: 'price', kind: 'builtin', type: 'number', value: 100, hard: true },
        soft('condition', 'good', 4),
        soft('brand', 'ikea', 5),
        soft('colour', 'oak', 2),
      ],
    });
    const feed = (): request.Test => request(app).get(`/api/feed?postId=${buyerRequest.id}`).set('Authorization', bearer(ME));
    // One request first, so start-up costs such as compiling the route are not counted as a slow request.
    await feed();

    const timesMs: number[] = [];
    for (let i = 0; i < REQUESTS; i += 1) {
      const started = performance.now();
      const response = await feed();
      timesMs.push(performance.now() - started);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ nextCursor: String(PAGE_SIZE) });
      expect((response.body as { matches: unknown[] }).matches).toHaveLength(PAGE_SIZE);
    }

    const sorted = [...timesMs].sort((a, b) => a - b);
    const p95 = percentile(sorted, PERCENTILE);
    const mean = timesMs.reduce((sum, ms) => sum + ms, 0) / timesMs.length;
    console.info(
      `NFR 1: ${REQUESTS} requests, ${CANDIDATES} candidates: ` +
        `p50 ${percentile(sorted, 0.5).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ` +
        `max ${(sorted[sorted.length - 1] ?? 0).toFixed(1)} ms, mean ${mean.toFixed(1)} ms (limit ${LATENCY_LIMIT_MS} ms at p95)`
    );
    expect(p95).toBeLessThan(LATENCY_LIMIT_MS);
  }, 120_000);
});
