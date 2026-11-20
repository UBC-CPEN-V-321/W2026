import type { Express } from 'express';
import { type Db, MongoServerError, ObjectId } from 'mongodb';

import {
  createApp as createBackendApp,
  type AppDependencies,
} from '../../../src/index';
import { UserDao } from '../../../src/users/userDao';
import type { UserRepository } from '../../../src/users/userRepository';
import {
  authenticatedAgent,
  createPathSessionValidator,
} from '../../support/authTestUtils';

const USER_ID = '6705f0000000000000000001';

function createApp(dependencies: Omit<AppDependencies, 'sessionService'>): Express {
  return createBackendApp({
    ...dependencies,
    sessionService: createPathSessionValidator(),
  });
}

const request = (app: Express) => authenticatedAgent(app);

function createMockRepository(): jest.Mocked<UserRepository> {
  return {
    findOrCreateByGoogleIdentity: jest.fn(),
    findPreferences: jest.fn(),
    findUser: jest.fn(),
    updateUser: jest.fn(),
  };
}

function createUserDao(collection: object): UserDao {
  const database = {
    collection: jest.fn(() => collection),
  } as unknown as Db;
  return new UserDao(database);
}

function storedUser() {
  return {
    _id: new ObjectId(USER_ID),
    googleSubject: 'google-subject-123',
    email: 'student@example.com',
    displayName: 'Student Name',
    profileImageUrl: null,
    start_location: '',
    preferences: {
      transportation: { mode: 'walking' },
      budget: 'economical',
      interest: 'food',
    },
    onboardingCompletedAt: null,
    create_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z'),
  };
}

const GOOGLE_IDENTITY = {
  googleSubject: 'google-subject-123',
  email: 'student@example.com',
  displayName: 'Student Name',
  profileImageUrl: null,
};

describe('Google identity persistence — mocks', () => {
  test('fails if MongoDB returns no user after an upsert', async () => {
    const dao = createUserDao({
      findOneAndUpdate: jest.fn().mockResolvedValue({ value: null }),
    });

    await expect(
      dao.findOrCreateByGoogleIdentity(GOOGLE_IDENTITY),
    ).rejects.toThrow('MongoDB did not return the found or created user.');
  });

  test('rethrows non-duplicate MongoDB failures', async () => {
    const failure = new Error('database unavailable');
    const dao = createUserDao({
      findOneAndUpdate: jest.fn().mockRejectedValue(failure),
    });

    await expect(
      dao.findOrCreateByGoogleIdentity(GOOGLE_IDENTITY),
    ).rejects.toBe(failure);
  });

  test.each([
    [storedUser(), USER_ID],
    [null, null],
  ])(
    'handles a duplicate-key race when the follow-up user is %#',
    async (existingUser, expectedId) => {
      const duplicateKey = new MongoServerError({
        message: 'duplicate key',
        code: 11000,
      });
      const dao = createUserDao({
        findOneAndUpdate: jest.fn().mockRejectedValue(duplicateKey),
        findOne: jest.fn().mockResolvedValue(existingUser),
      });

      if (expectedId === null) {
        await expect(
          dao.findOrCreateByGoogleIdentity(GOOGLE_IDENTITY),
        ).rejects.toBe(duplicateKey);
      } else {
        await expect(
          dao.findOrCreateByGoogleIdentity(GOOGLE_IDENTITY),
        ).resolves.toMatchObject({ id: expectedId });
      }
    },
  );
});

describe('GET /api/v1/users/:userId — mocks', () => {
  test('returns 500 when the database read fails', async () => {
    // Input: valid user ID. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: findUser rejects to simulate an unavailable database.
    const repository = createMockRepository();
    repository.findUser.mockRejectedValue(new Error('database unavailable'));
    const app = createApp({ userRepository: repository });

    const response = await request(app).get(`/api/v1/users/${USER_ID}`);

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(repository.findUser).toHaveBeenCalledWith(USER_ID);
  });
});
describe('PATCH /api/v1/users/:userId — mocks', () => {
  test('returns 500 when the database update fails', async () => {
    // Input: valid profile update. Expect: 500 INTERNAL_SERVER_ERROR.
    // Mock: updateUser rejects to simulate a database write failure.
    const repository = createMockRepository();
    repository.updateUser.mockRejectedValue(new Error('database unavailable'));
    const app = createApp({ userRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}`)
      .send({ displayName: 'Updated User' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(repository.updateUser).toHaveBeenCalledWith(USER_ID, {
      displayName: 'Updated User',
    });
  });

  test('returns 404 when the repository cannot update the user', async () => {
    // Input: valid profile update. Expect: 404 when no user was updated.
    const repository = createMockRepository();
    repository.updateUser.mockResolvedValue(null);
    const app = createApp({ userRepository: repository });

    const response = await request(app)
      .patch(`/api/v1/users/${USER_ID}`)
      .send({ start_location: 'UBC Nest' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
    expect(repository.updateUser).toHaveBeenCalledTimes(1);
  });
});
