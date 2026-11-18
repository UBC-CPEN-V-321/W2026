import request from 'supertest';
import { createApp } from '../../src/app';
import { authErrors } from '../../src/auth/requireAuth';
import { signAccessToken } from '../../src/auth/tokens';
import { commonErrors, errorBody } from '../../src/errors';
import { getUserById } from '../../src/users/users.repository';

// /user/me is behind requireAuth, so requests need a valid token
process.env.JWT_SECRET = 'test-jwt-secret';
const userId = '0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e';
const authHeader = `Bearer ${signAccessToken(userId)}`;

jest.mock('../../src/users/users.repository', () => ({
  createUser: jest.fn(),
  getUserByGoogleSub: jest.fn(),
  getUserById: jest.fn(),
}));

const mockedGetUserById = jest.mocked(getUserById);

describe('Mocked: GET /user/me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Input: a signed-in user who exists
  // Expected behavior: returns their profile with the full decimal rating
  // Expected output: 200 with the user
  test('Returns the signed-in user with their rating', async () => {
    const user = {
      id: userId,
      username: 'dave',
      name: 'Dave',
      email: 'dave@example.com',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      rating: 1512.37,
    };
    mockedGetUserById.mockResolvedValue(user);

    const response = await request(createApp())
      .get('/user/me')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { ...user, createdAt: user.createdAt.toISOString() },
    });
    expect(mockedGetUserById).toHaveBeenCalledWith(userId);
  });

  // Input: a valid token for a user that no longer exists
  // Expected behavior: nothing to return
  // Expected output: 404 { error: "User not found", code: "USER_NOT_FOUND" }
  test('Returns 404 when the user does not exist', async () => {
    mockedGetUserById.mockResolvedValue(null);

    const response = await request(createApp())
      .get('/user/me')
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.UserNotFound));
  });

  // Input: no Authorization header
  // Expected behavior: requireAuth rejects the request
  // Expected output: 401 { error: "Missing auth token", code: "MISSING_AUTH_TOKEN" }
  test('Rejects a request without a token', async () => {
    const response = await request(createApp()).get('/user/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorBody(authErrors.MissingToken));
    expect(mockedGetUserById).not.toHaveBeenCalled();
  });

  // Input: the repository throws
  // Expected behavior: the error is logged
  // Expected output: 500 { error: "Internal server error", code: "INTERNAL_ERROR" }
  test('Returns 500 when the database fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    mockedGetUserById.mockRejectedValue(new Error('database down'));

    const response = await request(createApp())
      .get('/user/me')
      .set('Authorization', authHeader);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(errorBody(commonErrors.Internal));
    consoleError.mockRestore();
  });
});
