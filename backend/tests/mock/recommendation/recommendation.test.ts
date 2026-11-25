import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import request from 'supertest';

import {
  createApp as createBackendApp,
  type AppDependencies,
} from '../../../src/index';
import type { Itinerary } from '../../../src/itineraries/itineraryTypes';
import { QwenClient } from '../../../src/recommendation/qwenClient';
import { RecommendationDao } from '../../../src/recommendation/recommendationDao';
import { RecommendationConfigurationError } from '../../../src/recommendation/recommendationErrors';
import type { RecommendationRepository } from '../../../src/recommendation/recommendationRepository';
import { createRecommendationRouter } from '../../../src/recommendation/recommendationRouter';
import type { RecommendationService } from '../../../src/recommendation/recommendationService';
import {
  cleanTextForRanking,
  UniversalSentenceEncoderItineraryRanker,
} from '../../../src/recommendation/universalSentenceEncoderRanker';
import type {
  GeneratedItineraryInput,
  ItineraryGenerator,
  ItineraryRanker,
  RecommendationProfile,
  RecommendedItineraryInput,
} from '../../../src/recommendation/recommendationTypes';
import type { UserRepository } from '../../../src/users/userRepository';
import type {
  GoogleUserIdentity,
  User,
  UserPreferences,
  UserUpdate,
} from '../../../src/users/userTypes';
import {
  authenticatedAgent,
  createPathSessionValidator,
} from '../../utils/authTestUtils';
import { USER_FIXTURE_ID } from '../../utils/userFixtures';

const USER_ID = USER_FIXTURE_ID;

function createApp(dependencies: Omit<AppDependencies, 'sessionService'>): Express {
  return createBackendApp({
    ...dependencies,
    sessionService: createPathSessionValidator(),
  });
}

const supertest = (app: Express) => authenticatedAgent(app);
const PREFERENCES: UserPreferences = {
  transportation: { mode: 'transit' },
  budget: 'balanced',
  interest: 'art',
};
const QWEN_CONFIG = {
  endpoint: 'https://qwen.example/v1',
  apiKey: 'test-key',
  model: 'qwen3.6-flash',
  timeoutMs: 120_000,
};

describe('Recommendation route ownership validation', () => {
  test.each(['GET', 'POST'])(
    '%s rejects a route mounted without a user ID',
    async (method) => {
      const service = {
        findLatestRecommendations: jest.fn(),
        generateRecommendations: jest.fn(),
      } as unknown as RecommendationService;
      const app = express();
      app.use('/recommendations', createRecommendationRouter(service));

      const response = method === 'GET'
        ? await request(app).get('/recommendations')
        : await request(app).post('/recommendations');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_USER_ID');
    },
  );
});

function generatedJson(count = 4): string {
  return JSON.stringify({
    itineraries: Array.from({ length: count }, (_, index) => ({
      name: `Generated itinerary ${index + 1}`,
      description: 'A generated day around UBC.',
      startingLocation: 'Untrusted LLM starting location',
      items: [
        {
          type: 'activity',
          name: `Activity ${index + 1}`,
          category: 'art',
          location: 'Museum of Anthropology at UBC',
          startTime: `2026-11-0${index + 1}T10:00:00.000Z`,
          endTime: `2026-11-0${index + 1}T11:00:00.000Z`,
        },
        {
          type: 'transportation',
          mode: 'transit',
          startLocation: 'Museum of Anthropology at UBC',
          endLocation: 'UBC Bus Exchange',
          distanceMeters: 1800,
          startTime: `2026-11-0${index + 1}T11:00:00.000Z`,
          endTime: `2026-11-0${index + 1}T11:20:00.000Z`,
        },
      ],
    })),
  });
}

class TestUserRepository implements UserRepository {
  constructor(private readonly startLocation = 'UBC Bus Exchange') {}

  async findUser(userId: string): Promise<User | null> {
    if (userId !== USER_ID) return null;
    return {
      id: USER_ID,
      googleSubject: 'google-subject',
      email: 'student@example.com',
      displayName: 'Student',
      profileImageUrl: null,
      start_location: this.startLocation,
      preferences: PREFERENCES,
      onboardingCompletedAt: new Date('2026-10-01T00:00:00.000Z'),
      create_at: new Date('2026-10-01T00:00:00.000Z'),
      updated_at: new Date('2026-10-01T00:00:00.000Z'),
    };
  }

  async findPreferences(userId: string): Promise<UserPreferences | null> {
    return userId === USER_ID ? PREFERENCES : null;
  }

  async findOrCreateByGoogleIdentity(
    identity: GoogleUserIdentity,
  ): Promise<User> {
    const user = await this.findUser(USER_ID);
    if (user !== null) return user;
    throw new Error(`Could not create ${identity.googleSubject}`);
  }

  async updateUser(
    _userId: string,
    _update: UserUpdate,
  ): Promise<User | null> {
    return null;
  }
}

class TestRecommendationRepository implements RecommendationRepository {
  replacementCalls = 0;
  itineraries: Itinerary[] = [];

  async findLatestRecommendations(userId: string): Promise<Itinerary[]> {
    return userId === USER_ID ? this.itineraries : [];
  }

  async replaceLatestRecommendations(
    userId: string,
    inputs: RecommendedItineraryInput[],
  ): Promise<Itinerary[]> {
    this.replacementCalls += 1;
    this.itineraries = inputs.map((input, index) => ({
      ...input,
      id: `6705f100000000000000000${index + 1}`,
      ownerId: userId,
      items: input.items.map((item, itemIndex) => ({
        ...item,
        id: `item-${index}-${itemIndex}`,
      })),
      createdAt: '2026-10-25T12:00:00.000Z',
      updatedAt: '2026-10-25T12:00:00.000Z',
      saved: false,
      inRecommendation: true,
    }));
    return this.itineraries;
  }
}

class TestGenerator implements ItineraryGenerator {
  receivedProfile: RecommendationProfile | undefined;

  constructor(private readonly output: string) {}

  async generateItineraries(profile: RecommendationProfile): Promise<string> {
    this.receivedProfile = profile;
    return this.output;
  }
}

class TestRanker implements ItineraryRanker {
  receivedInterest: string | undefined;

  async rankItineraries(
    itineraries: GeneratedItineraryInput[],
    interest: UserPreferences['interest'],
  ): Promise<RecommendedItineraryInput[]> {
    this.receivedInterest = interest;
    const scores = [0.25, 0.9, 0.5, 0.75];
    return itineraries.map((itinerary, index) => {
      const interestSimilarity = scores[index] ?? 0;
      return {
        ...itinerary,
        score: {
          interestSimilarity,
          interestSimilarityOutOfFive:
            3.5 + ((interestSimilarity - 0.25) / 0.65) * 1.5,
        },
      };
    });
  }
}

function buildApp(
  generator: ItineraryGenerator,
  repository = new TestRecommendationRepository(),
  userRepository: UserRepository = new TestUserRepository(),
  ranker = new TestRanker(),
) {
  return {
    app: createApp({
      recommendationGenerator: generator,
      recommendationRanker: ranker,
      recommendationRepository: repository,
      userRepository,
    }),
    repository,
    ranker,
  };
}

describe('Mocked: POST /api/v1/users/:userId/recommendations', () => {
  test('loads the profile and returns generated and fetched results by score', async () => {
    const generator = new TestGenerator(generatedJson());
    const { app, ranker } = buildApp(generator);

    const response = await supertest(app)
      .post(`/api/v1/users/${USER_ID}/recommendations`)
      .send({});

    expect(response.status).toBe(201);
    expect(generator.receivedProfile).toEqual({
      start_location: 'UBC Bus Exchange',
      preferences: PREFERENCES,
    });
    expect(ranker.receivedInterest).toBe('art');
    expect(response.body.itineraries).toHaveLength(4);
    expect(response.body.itineraries.map((itinerary: Itinerary) => itinerary.name))
      .toEqual([
        'Generated itinerary 2',
        'Generated itinerary 4',
        'Generated itinerary 3',
        'Generated itinerary 1',
      ]);
    expect(response.body.itineraries[0]).toMatchObject({
      ownerId: USER_ID,
      startingLocation: 'UBC Bus Exchange',
      saved: false,
      inRecommendation: true,
      score: {
        interestSimilarity: 0.9,
        interestSimilarityOutOfFive: 5,
      },
    });
  });

  test('keeps existing recommendations when the LLM returns fewer than four', async () => {
    const repository = new TestRecommendationRepository();
    const { app } = buildApp(new TestGenerator(generatedJson(3)), repository);

    const response = await supertest(app)
      .post(`/api/v1/users/${USER_ID}/recommendations`)
      .send({});

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('RECOMMENDATION_GENERATION_FAILED');
    expect(repository.replacementCalls).toBe(0);
  });

  test('rejects generation when the profile has no starting location', async () => {
    const generator = new TestGenerator(generatedJson());
    const { app } = buildApp(
      generator,
      new TestRecommendationRepository(),
      new TestUserRepository(''),
    );

    const response = await supertest(app)
      .post(`/api/v1/users/${USER_ID}/recommendations`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INCOMPLETE_PROFILE');
    expect(generator.receivedProfile).toBeUndefined();
  });

  test('returns not found when the route user does not exist', async () => {
    const { app } = buildApp(new TestGenerator(generatedJson()));
    const response = await supertest(app)
      .post('/api/v1/users/6705f0000000000000000099/recommendations')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });
});

describe('Mocked: GET /api/v1/users/:userId/recommendations', () => {
  test('returns the current recommendations sorted by score', async () => {
    const repository = new TestRecommendationRepository();
    const scoredRecommendations: Array<[string, number | undefined]> = [
      ['Low', 0.25],
      ['High', 0.9],
      ['Medium', 0.5],
      ['No score', undefined],
    ];
    repository.itineraries = scoredRecommendations.map(
      ([name, interestSimilarity], index) => ({
        id: `recommendation-${index}`,
        ownerId: USER_ID,
        name,
        items: [],
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        saved: false,
        inRecommendation: true,
        score: interestSimilarity === undefined ? {} : { interestSimilarity },
      }),
    );
    const { app } = buildApp(new TestGenerator(generatedJson()), repository);

    const response = await supertest(app)
      .get(`/api/v1/users/${USER_ID}/recommendations`);

    expect(response.status).toBe(200);
    expect(response.body.itineraries.map((itinerary: Itinerary) => itinerary.name))
      .toEqual(['High', 'Medium', 'Low', 'No score']);
  });

  test('returns an empty list when the repository has no recommendations', async () => {
    const { app } = buildApp(new TestGenerator(generatedJson()));

    const response = await supertest(app)
      .get('/api/v1/users/6705f0000000000000000099/recommendations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ itineraries: [] });
  });

  test('maps unexpected repository failures to an internal error', async () => {
    const repository = new TestRecommendationRepository();
    repository.findLatestRecommendations = async () => {
      throw new Error('database unavailable');
    };
    const { app } = buildApp(new TestGenerator(generatedJson()), repository);

    const response = await supertest(app)
      .get(`/api/v1/users/${USER_ID}/recommendations`);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('Universal Sentence Encoder itinerary ranking', () => {
  test('removes punctuation and stop words before vector lookup', () => {
    expect(cleanTextForRanking('The museum, and ART! at markets.'))
      .toBe('museum art markets');
  });

  test('scores descriptions by cosine similarity and sorts descending', async () => {
    const embeddingValues: Record<string, number[]> = {
      art: [1, 0],
      gallery: [0.9, 0.1],
      painting: [0.8, 0.2],
      hiking: [0, 1],
    };
    const dispose = jest.fn();
    const ranker = new UniversalSentenceEncoderItineraryRanker(async () => ({
      embed: async (texts: string[]) => ({
        array: async () => texts.map((text) =>
          embeddingValues[text] ?? embeddingValues[text.split(' ')[0]!] ?? [0, 0],
        ),
        dispose,
      }),
    }));
    const candidates: GeneratedItineraryInput[] = [
      { name: 'Hiking', description: 'The hiking trail.', items: [] },
      { name: 'Gallery', description: 'A gallery!', items: [] },
      { name: 'Unknown', description: 'Unmapped vocabulary.', items: [] },
      { name: 'Painting', description: 'Painting and the arts.', items: [] },
    ];

    const ranked = await ranker.rankItineraries(candidates, 'art');

    expect(ranked.map((itinerary) => itinerary.name)).toEqual([
      'Gallery',
      'Painting',
      'Hiking',
      'Unknown',
    ]);
    expect(ranked[0]?.score.interestSimilarity).toBeCloseTo(0.993884, 6);
    expect(ranked[0]?.score.interestSimilarityOutOfFive).toBe(5);
    expect(ranked[1]?.score.interestSimilarity).toBeCloseTo(0.970143, 6);
    expect(ranked[1]?.score.interestSimilarityOutOfFive).toBeCloseTo(4.964169, 6);
    expect(ranked[2]?.score.interestSimilarity).toBe(0);
    expect(ranked[2]?.score.interestSimilarityOutOfFive).toBe(3.5);
    expect(ranked[3]?.score.interestSimilarity).toBe(0);
    expect(ranked[3]?.score.interestSimilarityOutOfFive).toBe(3.5);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('handles empty descriptions, equal scores, and mismatched vectors', async () => {
    const dispose = jest.fn();
    const loadModel = jest.fn(async () => ({
      embed: async () => ({
        array: async () => [[1, 0], [1], [0, 0], [1, 0]],
        dispose,
      }),
    }));
    const ranker = new UniversalSentenceEncoderItineraryRanker(loadModel);
    const candidates: GeneratedItineraryInput[] = [
      { name: 'Missing description', items: [] },
      { name: 'Zero vector', description: 'zero', items: [] },
      { name: 'Matching vector', description: 'match', items: [] },
    ];

    const first = await ranker.rankItineraries(candidates, 'art');
    const second = await ranker.rankItineraries(candidates, 'art');

    expect(first.map((itinerary) => itinerary.score.interestSimilarity))
      .toEqual([1, 0, 0]);
    expect(first[0]?.score.interestSimilarityOutOfFive).toBe(5);
    expect(first[1]?.score.interestSimilarityOutOfFive).toBe(3.5);
    expect(second).toEqual(first);
    expect(loadModel).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  test.each([
    [new Error('model download failed'), 'model download failed'],
    ['non-error rejection', 'Could not load the sentence encoder model.'],
  ])('maps model loader failure %# to a generation error', async (failure, message) => {
    const ranker = new UniversalSentenceEncoderItineraryRanker(
      async () => Promise.reject(failure),
    );

    await expect(ranker.rankItineraries([], 'art'))
      .rejects.toThrow(message);
  });
});

describe('Mocked: RecommendationDao publication', () => {
  function createDao(options: {
    deleteFailure?: Error;
    matchedCount?: number;
  } = {}) {
    const findCursor = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
    };
    const deleteMany = options.deleteFailure === undefined
      ? jest.fn().mockResolvedValue({ deletedCount: 0 })
      : jest.fn()
        .mockRejectedValueOnce(options.deleteFailure)
        .mockResolvedValueOnce({ deletedCount: 4 });
    const collection = {
      find: jest.fn().mockReturnValue(findCursor),
      insertMany: jest.fn().mockResolvedValue({ insertedCount: 4 }),
      deleteMany,
      updateMany: jest.fn().mockResolvedValue({
        matchedCount: options.matchedCount ?? 4,
      }),
    };
    const database = {
      collection: jest.fn().mockReturnValue(collection),
    } as unknown as Db;
    return { dao: new RecommendationDao(database), collection };
  }

  const inputs: RecommendedItineraryInput[] = Array.from(
    { length: 4 },
    (_, index) => ({
      name: `Candidate ${index + 1}`,
      description: `Description ${index + 1}`,
      startingLocation: 'UBC Bus Exchange',
      items: [],
      score: { interestSimilarity: index / 10 },
    }),
  );

  test('cleans up inserted candidates when deleting old recommendations fails', async () => {
    const failure = new Error('delete failed');
    const { dao, collection } = createDao({ deleteFailure: failure });

    await expect(dao.replaceLatestRecommendations(USER_ID, inputs))
      .rejects.toBe(failure);
    expect(collection.deleteMany).toHaveBeenCalledTimes(2);
  });

  test('cleans up when not every candidate can be published', async () => {
    const { dao, collection } = createDao({ matchedCount: 3 });

    await expect(dao.replaceLatestRecommendations(USER_ID, inputs))
      .rejects.toThrow('Not all generated recommendations could be published.');
    expect(collection.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe('Mocked: Qwen Responses API client', () => {
  test('requests thinking mode and extracts message output text', async () => {
    const create = jest.fn().mockResolvedValue({
      output: [
        { type: 'reasoning', summary: [{ text: 'Internal reasoning' }] },
        {
          type: 'message',
          content: [{ type: 'output_text', text: generatedJson() }],
        },
      ],
    });
    const client = new QwenClient(QWEN_CONFIG, { responses: { create } });

    await expect(client.generateItineraries({
      start_location: 'UBC Bus Exchange',
      preferences: PREFERENCES,
    })).resolves.toBe(generatedJson());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'qwen3.6-flash',
      enable_thinking: true,
      input: expect.stringContaining('UBC Bus Exchange'),
    }));
  });

  test('uses top-level output text when provided', async () => {
    const create = jest.fn().mockResolvedValue({
      output_text: generatedJson(),
      output: [],
    });
    const client = new QwenClient(QWEN_CONFIG, { responses: { create } });

    await expect(client.generateItineraries({
      start_location: 'UBC Bus Exchange',
      preferences: PREFERENCES,
    })).resolves.toBe(generatedJson());
  });

  test('requires QWEN_API_KEY', async () => {
    const client = new QwenClient({ ...QWEN_CONFIG, apiKey: '' });

    await expect(client.generateItineraries({
      start_location: 'UBC Bus Exchange',
      preferences: PREFERENCES,
    })).rejects.toBeInstanceOf(RecommendationConfigurationError);
  });

  test('accepts Qwen configuration explicitly', () => {
    expect(new QwenClient(QWEN_CONFIG)).toBeInstanceOf(QwenClient);
  });

  test.each([
    [{ output: [] }, 'returned no output text'],
    [{ output_text: ' ', output: [{ type: 'reasoning' }] }, 'returned no output text'],
    [{ output: [{ type: 'message' }] }, 'returned no output text'],
  ])('rejects a response without answer text %#', async (response, message) => {
    const create = jest.fn().mockResolvedValue(response);
    const client = new QwenClient(QWEN_CONFIG, { responses: { create } });

    await expect(client.generateItineraries({
      start_location: 'UBC Bus Exchange',
      preferences: PREFERENCES,
    })).rejects.toThrow(message);
  });

  test.each([
    [new Error('provider unavailable'), 'provider unavailable'],
    ['provider unavailable', 'provider unavailable'],
  ])('wraps provider failure %#', async (failure, message) => {
    const create = jest.fn().mockRejectedValue(failure);
    const client = new QwenClient(QWEN_CONFIG, { responses: { create } });

    await expect(client.generateItineraries({
      start_location: 'UBC Bus Exchange',
      preferences: PREFERENCES,
    })).rejects.toThrow(`The Qwen generation service failed: ${message}`);
  });
});
