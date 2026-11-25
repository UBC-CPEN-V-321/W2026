// MongoDB init script for the isolated frontend E2E database.
// Mounted only into the e2e-mongo service and run by mongosh on first initialization.
const exploreUbcDb = db.getSiblingDB('cpen321');

const TEST_USER_ID = ObjectId('6acd519c76376cefc61e97f1');
const CREATE_PROFILE_USER_ID = ObjectId('6acd519c76376cefc61e97f2');
const LOGOUT_PROFILE_USER_ID = ObjectId('6acd519c76376cefc61e97f3');
const BASELINE_ITINERARY_ID = ObjectId('6705f1000000000000000001');
const EVENT_ID_PREFIX = 'e2e-';
const E2E_SESSION_DAYS = 30;

const UBC_LONGITUDE = -123.246;
const UBC_LATITUDE = 49.2606;
const KM_PER_DEGREE_LATITUDE = 111.2;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FAR_LONGITUDE = -122.3045;
const FAR_LATITUDE = 49.0504;
const FAR_EVENT_COUNT = 3;
const SPORTS_EVENT_COUNT = 21;
const MUSIC_EVENT_COUNT = 3;

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

function buildBaselineItinerary(firstEvent, base) {
  const start = new Date(firstEvent.startDateTime.getTime() + HOUR_MS / 2);
  const end = new Date(firstEvent.startDateTime.getTime() + 1.5 * HOUR_MS);
  return {
    _id: BASELINE_ITINERARY_ID,
    ownerId: TEST_USER_ID,
    name: 'E2E Baseline Itinerary',
    description: 'Seeded itinerary for E2E tests.',
    startingLocation: 'UBC Bus Exchange',
    items: [{
      id: '33333333-3333-4333-8333-333333333333',
      type: 'activity',
      name: 'E2E Overlapping Activity',
      description: 'Overlaps the first seeded event.',
      category: 'outdoors',
      location: 'UBC',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    }],
    createdAt: base,
    updatedAt: base,
    saved: true,
    inRecommendation: false,
    score: { overall: 0.9 },
  };
}

const base = new Date();
const events = buildEvents(base);

// Keep the same indexes as the application database initializer.
exploreUbcDb.itineraryMaps.createIndex(
  { itineraryId: 1 },
  { unique: true, name: 'unique_itinerary_map' },
);
exploreUbcDb.liveevents.createIndex(
  { externalId: 1 },
  { unique: true, name: 'unique_external_event' },
);
exploreUbcDb.liveevents.createIndex({ startDateTime: 1 });
exploreUbcDb.liveevents.createIndex({ category: 1, startDateTime: 1 });
exploreUbcDb.liveevents.createIndex({ location: '2dsphere' });

exploreUbcDb.liveevents.insertMany(events);
exploreUbcDb.itineraries.insertOne(buildBaselineItinerary(events[0], base));

exploreUbcDb.users.insertMany([
  {
    _id: TEST_USER_ID,
    googleSubject: 'dev-seed-user-google-subject',
    email: 'test.user@student.ubc.ca',
    displayName: 'Test User',
    profileImageUrl: null,
    start_location: 'UBC Bus Exchange',
    preferences: { transportation: { mode: 'transit' }, budget: 'balanced', interest: 'outdoors' },
    onboardingCompletedAt: base,
    create_at: base,
    updated_at: base,
  },
  ...[
    [CREATE_PROFILE_USER_ID, 'create'],
    [LOGOUT_PROFILE_USER_ID, 'logout'],
  ].map(([userId, suffix]) => ({
    _id: userId,
    googleSubject: `e2e-onboarding-${suffix}`,
    email: `e2e-onboarding-${suffix}@example.com`,
    displayName: 'E2E New User',
    profileImageUrl: null,
    start_location: '',
    preferences: { transportation: { mode: 'walking' }, budget: 'economical', interest: 'food' },
    onboardingCompletedAt: null,
    create_at: base,
    updated_at: base,
  })),
]);

// SHA-256 hashes of the session tokens used by RealBackendSupport.kt.
exploreUbcDb.sessions.insertMany([
  {
    userId: TEST_USER_ID,
    tokenHash: 'a14b6689f109607282f6648d5aea4130efb15a576218e5eda7e0e6e098a4b565',
    createdAt: base,
    expiresAt: new Date(base.getTime() + E2E_SESSION_DAYS * DAY_MS),
  },
  {
    userId: CREATE_PROFILE_USER_ID,
    tokenHash: 'ab425275d8004957f529ea5015c71a90d43b5c83c46140c4c4f74784586f3f78',
    createdAt: base,
    expiresAt: new Date(base.getTime() + E2E_SESSION_DAYS * DAY_MS),
  },
  {
    userId: LOGOUT_PROFILE_USER_ID,
    tokenHash: 'edc6c6e6434b6e29c58a639c978e7eca8abc4285c606c388c14bfc12c2a14f01',
    createdAt: base,
    expiresAt: new Date(base.getTime() + E2E_SESSION_DAYS * DAY_MS),
  },
]);

print(`E2E database initialized with ${SPORTS_EVENT_COUNT} Sports, ${MUSIC_EVENT_COUNT} Music, and ${FAR_EVENT_COUNT} far-away events.`);
