import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { Types } from 'mongoose';

import { createApp } from '../../src/app';
import { UserModel } from '../../src/models/user.model';
import { bearer, createSignedInUser } from '../helpers/auth';
import { useTestDatabase } from '../helpers/db';

useTestDatabase();

interface GoogleLatencies {
  driveMatrixMs: number;
  transitMatrixMs: number;
  routeDetailsMs: number;
}

const latencies = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'planner-google-latencies.json'), 'utf8')) as GoogleLatencies;
const ORIGIN = { label: 'UBC', lat: 49.2606, lng: -123.246, placeId: 'ubc' };
const DESTINATION = { label: 'Waterfront', lat: 49.2857, lng: -123.111, placeId: 'waterfront' };
const REQUESTS = 20;
const P95_TARGET_MS = 4000;
// Jest's default 5 s is for the whole test, which is far less than 20 requests at the target; the p95 assertion,
// not this timeout, checks the requirement
const TEST_TIMEOUT_MS = REQUESTS * P95_TARGET_MS;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function googleResponse(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

// whether a matrix origin is the trip's origin rather than a parking spot
function isTripOrigin(origin: unknown): boolean {
  const place = origin as { waypoint?: { location?: { latLng?: { latitude?: number } } } };
  return place.waypoint?.location?.latLng?.latitude === ORIGIN.lat;
}

function installGoogleFixture(): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as { travelMode?: string; origins?: unknown[]; destinations?: unknown[] };
    if (url.includes('computeRouteMatrix')) {
      // wave 1 sends the drive and the direct transit matrices together; wave 2 prices transit from the spots
      await wait(body.travelMode === 'DRIVE' ? latencies.driveMatrixMs : latencies.transitMatrixMs);
      if (body.travelMode === 'DRIVE') {
        // the last destination is the trip's own: driving straight there takes 25 minutes
        return googleResponse((body.destinations ?? []).map((_, destinationIndex) => ({
          originIndex: 0,
          destinationIndex,
          duration: `${600 + destinationIndex * 300}s`,
          distanceMeters: 8000 + destinationIndex * 1000,
          condition: 'ROUTE_EXISTS',
        })));
      }
      // one origin is wave 1's direct transit from UBC, which takes 50 minutes; otherwise the origins are spots
      const direct = body.origins?.length === 1 && isTripOrigin(body.origins[0]);
      return googleResponse((body.origins ?? []).map((_, originIndex) => ({
        originIndex,
        destinationIndex: 0,
        duration: direct ? '3000s' : `${1800 - originIndex * 300}s`,
        distanceMeters: 15000 + originIndex * 500,
        condition: 'ROUTE_EXISTS',
      })));
    }
    await wait(latencies.routeDetailsMs);
    const isDrive = body.travelMode === 'DRIVE';
    return googleResponse({
      routes: [{
        duration: isDrive ? '900s' : '1500s',
        distanceMeters: isDrive ? 9000 : 15000,
        polyline: { encodedPolyline: isDrive ? 'drive-line' : 'transit-line' },
        legs: [{
          startTime: '2026-11-02T08:00:00Z',
          endTime: '2026-11-02T08:25:00Z',
          steps: isDrive
            ? []
            : [{
              travelMode: 'TRANSIT',
              transitDetails: {
                transitLine: { name: 'SkyTrain', color: '#0067A0', vehicle: { name: 'SkyTrain', type: 'RAIL' } },
                stopDetails: { departureStop: { name: 'Waterfront' }, arrivalStop: { name: 'Commercial-Broadway' }, stopCount: 6 },
              },
            }],
        }],
      }],
    });
  });
}

describe('NFR: planner response time', () => {
  // Mocked behavior: Google responds at the fixture latencies, so a plan waits on three Google round trips in a row:
  //                  wave 1 (drive and direct transit matrices), wave 2 (transit from the surviving spots), then
  //                  route details
  // Input: 20 authenticated Drive -> Transit planning requests with three saved parking spots
  // Expected status code: 200 for every request
  // Expected behavior: each request returns three planned options and p95 is at most four seconds
  // Expected output: timing samples and the planner's screening log are logged for the Testing.md write-up
  test('returns three routes within the 4-second p95 target', async () => {
    const savedAt = new Date('2026-11-02T00:00:00Z');
    const parkingSpots = [
      { lat: 49.27, lng: -123.19 },
      { lat: 49.275, lng: -123.17 },
      { lat: 49.28, lng: -123.15 },
    ].map(({ lat, lng }, index) => ({
      _id: new Types.ObjectId(),
      label: `Transfer ${index + 1}`,
      location: { lat, lng },
      placeId: `spot-${index + 1}`,
      rateCents: 500,
      ratePer: 'HOUR' as const,
      overnightAllowed: true,
      createdAt: savedAt,
    }));
    const { user, token } = await createSignedInUser({
      timezone: 'America/Vancouver',
      vehicle: { make: 'Honda', model: 'Civic', colour: null, litresPer100km: 8 },
      transit: { fareType: 'ADULT_STORED_VALUE', monthlyPassZones: null },
      lastGasPrice: { centsPerLitre: 200, savedAt },
      parkingSpots,
    });
    const fetchMock = installGoogleFixture();
    const screening = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const samples: number[] = [];

    for (let iteration = 0; iteration < REQUESTS; iteration += 1) {
      const startedAt = performance.now();
      const response = await request(createApp()).post('/api/routes/plan').set('Authorization', bearer(token)).send({
        origin: ORIGIN,
        destination: DESTINATION,
        arriveBy: null,
        modes: ['DRIVE', 'TRANSIT'],
      });
      samples.push(performance.now() - startedAt);
      expect(response.status).toBe(200);
      expect(response.body.options).toHaveLength(3);
    }

    const sortedSamples = [...samples].sort((a, b) => a - b);
    const p95 = sortedSamples[Math.ceil(sortedSamples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    console.log(`Planner response times ms: ${samples.map((sample) => sample.toFixed(1)).join(', ')}`);
    console.log(`Planner p95: ${p95.toFixed(1)} ms. Last plan's screening: ${String(screening.mock.calls.at(-1)?.[0])}`);
    expect(p95).toBeLessThanOrEqual(P95_TARGET_MS);
    expect(fetchMock).toHaveBeenCalled();
    expect(await UserModel.findById(user._id).lean()).not.toBeNull();
  }, TEST_TIMEOUT_MS);
});
