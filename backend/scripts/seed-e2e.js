// Seeds (or cleans) the throwaway MongoDB used by the frontend E2E tests.
//   node scripts/seed-e2e.js         create schema/indexes and seed test data
//   node scripts/seed-e2e.js empty   same, but with no events (for the empty-state test)
//   node scripts/seed-e2e.js clean   remove the seeded events and itinerary
// Refuses to run against Atlas. The target is E2E_MONGODB_URI (default: local Docker DB).
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { MongoClient, ObjectId } = require('mongodb');

const E2E_URI = process.env.E2E_MONGODB_URI?.trim() || 'mongodb://localhost:27018';
const DATABASE_NAME = 'cpen321';
const TEST_USER_ID = new ObjectId('6acd519c76376cefc61e97f1');
const BASELINE_ITINERARY_ID = new ObjectId('6705f1000000000000000001');
const EVENT_ID_PREFIX = 'e2e-';
// Session of the seeded user. The E2E tests install this token in the app, so no Google sign-in is needed.
const E2E_SESSION_TOKEN = 'e2e-live-events-session-token';
const E2E_SESSION_DAYS = 30;

// UBC, the app's default location.
const UBC_LONGITUDE = -123.246;
const UBC_LATITUDE = 49.2606;
const KM_PER_DEGREE_LATITUDE = 111.2;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Abbotsford, about 70 km from UBC (outside the 30 km search radius), for the location-change test.
const FAR_LONGITUDE = -122.3045;
const FAR_LATITUDE = 49.0504;
const FAR_EVENT_COUNT = 3;

const SPORTS_EVENT_COUNT = 21; // the seeded user's interest is outdoors -> Sports; 21 exercises "Load more"
const MUSIC_EVENT_COUNT = 3;

function assertLocalTarget() {
  if (/mongodb\.net|mongodb\+srv/i.test(E2E_URI)) {
    throw new Error('Refusing to seed an Atlas database. Use the local E2E database.');
  }
}

/**
 * Event n starts at 03:00 UTC (7 or 8 PM in Vancouver) n + 2 days from today, and is n * 0.1 km
 * north of UBC, so lower n scores higher. The fixed evening time keeps the end time (start + 2 hours)
 * in the evening, which the invalid-end-time E2E test relies on.
 */
function buildEvent(category, label, n, base, origin = { latitude: UBC_LATITUDE, longitude: UBC_LONGITUDE }) {
  const todayUtc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  const start = new Date(todayUtc + (n + 2) * DAY_MS + 3 * HOUR_MS);
  const padded = String(n).padStart(2, '0');
  return {
    externalId: `${EVENT_ID_PREFIX}${label}-${padded}`,
    title: `E2E ${{ sports: 'Event', music: 'Music', far: 'Far Event' }[label]} ${padded}`,
    description: `Seeded ${category} event ${padded} for E2E tests.`,
    imageUrl: 'https://example.com/e2e-event.jpg',
    startDateTime: start,
    endDateTime: new Date(start.getTime() + 2 * HOUR_MS),
    venueName: 'E2E Venue',
    city: 'Vancouver',
    location: {
      type: 'Point',
      coordinates: [origin.longitude, origin.latitude + (n * 0.1) / KM_PER_DEGREE_LATITUDE],
    },
    category,
    ticketUrl: 'https://example.com/e2e-tickets',
    priceMin: 20,
    priceMax: 40,
    currency: 'CAD',
    lastSyncedAt: base,
  };
}

function buildEvents(base) {
  const sports = Array.from({ length: SPORTS_EVENT_COUNT }, (_, i) =>
    buildEvent('Sports', 'sports', i + 1, base),
  );
  const music = Array.from({ length: MUSIC_EVENT_COUNT }, (_, i) =>
    buildEvent('Music', 'music', i + 1, base),
  );
  const far = Array.from({ length: FAR_EVENT_COUNT }, (_, i) =>
    buildEvent('Sports', 'far', i + 1, base, { latitude: FAR_LATITUDE, longitude: FAR_LONGITUDE }),
  );
  return [...sports, ...music, ...far];
}

/** Baseline itinerary whose activity overlaps "E2E Event 01" (for the time-conflict tests). */
function buildBaselineItinerary(firstEvent, base) {
  const start = new Date(firstEvent.startDateTime.getTime() + HOUR_MS / 2);
  const end = new Date(firstEvent.startDateTime.getTime() + 1.5 * HOUR_MS);
  return {
    _id: BASELINE_ITINERARY_ID,
    ownerId: TEST_USER_ID,
    name: 'E2E Baseline Itinerary',
    description: 'Seeded itinerary for E2E tests.',
    startingLocation: 'UBC Bus Exchange',
    items: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        type: 'activity',
        name: 'E2E Overlapping Activity',
        image: 'https://example.com/e2e-activity.jpg',
        description: 'Overlaps the first seeded event.',
        category: 'outdoors',
        location: 'UBC',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    ],
    createdAt: base,
    updatedAt: base,
    saved: true,
    inRecommendation: false,
    score: { overall: 0.9 },
  };
}

async function seed(database, { withEvents = true } = {}) {
  const base = new Date();
  const events = withEvents ? buildEvents(base) : [];

  await database.collection('liveevents').deleteMany({
    externalId: { $regex: `^${EVENT_ID_PREFIX}` },
  });
  if (events.length > 0) {
    await database.collection('liveevents').insertMany(events);
  }

  await database.collection('itineraries').deleteMany({ ownerId: TEST_USER_ID });
  if (events.length > 0) {
    await database.collection('itineraries').insertOne(buildBaselineItinerary(events[0], base));
  }

  await database
    .collection('users')
    .updateOne(
      { _id: TEST_USER_ID },
      { $set: { 'preferences.interest': 'outdoors', updated_at: base } },
    );

  await database.collection('sessions').deleteMany({ userId: TEST_USER_ID });
  await database.collection('sessions').insertOne({
    userId: TEST_USER_ID,
    tokenHash: createHash('sha256').update(E2E_SESSION_TOKEN, 'utf8').digest('hex'),
    createdAt: base,
    expiresAt: new Date(base.getTime() + E2E_SESSION_DAYS * DAY_MS),
  });

  console.log(
    withEvents
      ? `E2E data ready: ${SPORTS_EVENT_COUNT} Sports events, ${MUSIC_EVENT_COUNT} Music events, ${FAR_EVENT_COUNT} far-away Sports events, 1 itinerary.`
      : 'E2E data ready: test user only, no events.',
  );
}

async function clean(database) {
  const events = await database.collection('liveevents').deleteMany({
    externalId: { $regex: `^${EVENT_ID_PREFIX}` },
  });
  const itineraries = await database
    .collection('itineraries')
    .deleteMany({ ownerId: TEST_USER_ID });
  const sessions = await database.collection('sessions').deleteMany({ userId: TEST_USER_ID });
  console.log(
    `E2E data removed: ${events.deletedCount} events, ${itineraries.deletedCount} itineraries, ${sessions.deletedCount} sessions.`,
  );
}

async function main() {
  assertLocalTarget();
  const mode = process.argv[2];

  if (mode !== 'clean') {
    // Creates collections, validators, indexes and the test user in the E2E database.
    execFileSync(process.execPath, [path.join(__dirname, 'initialize-atlas.js')], {
      env: { ...process.env, MONGODB_URI: E2E_URI },
      stdio: 'inherit',
    });
  }

  const client = new MongoClient(E2E_URI);
  try {
    await client.connect();
    const database = client.db(DATABASE_NAME);
    if (mode === 'clean') await clean(database);
    else await seed(database, { withEvents: mode !== 'empty' });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('E2E seed failed:', error);
  process.exitCode = 1;
});
