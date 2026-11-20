import request from 'supertest';
import { createApp } from '../../src/app';
import { authErrors } from '../../src/auth/requireAuth';
import { signAccessToken } from '../../src/auth/tokens';
import { commonErrors, errorBody } from '../../src/errors';
import { getUserPhoto } from '../../src/users/users.repository';

process.env.JWT_SECRET = 'test-jwt-secret';
const userId = '0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e';
const targetUserId = 'a4d142a1-d1e7-48cf-93c0-12db4464bd59';
const authHeader = `Bearer ${signAccessToken(userId)}`;

jest.mock('../../src/users/users.repository', () => ({
  getUserPhoto: jest.fn(),
}));

const mockedGetUserPhoto = jest.mocked(getUserPhoto);

describe('Mocked: GET /user/:userId/photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Returns the requested user photo URL', async () => {
    mockedGetUserPhoto.mockResolvedValue({ photoUrl: 'https://example.com/photo.jpg' });

    const response = await request(createApp())
      .get(`/user/${targetUserId}/photo`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ photoUrl: 'https://example.com/photo.jpg' });
    expect(mockedGetUserPhoto).toHaveBeenCalledWith(targetUserId);
  });

  test('Returns null when the user has no photo', async () => {
    mockedGetUserPhoto.mockResolvedValue({ photoUrl: null });

    const response = await request(createApp())
      .get(`/user/${targetUserId}/photo`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ photoUrl: null });
  });

  test('Requires authentication', async () => {
    const response = await request(createApp()).get(`/user/${targetUserId}/photo`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorBody(authErrors.MissingToken));
    expect(mockedGetUserPhoto).not.toHaveBeenCalled();
  });

  test('Returns not found when the signed-in user no longer exists', async () => {
    mockedGetUserPhoto.mockResolvedValue(null);

    const response = await request(createApp())
      .get(`/user/${targetUserId}/photo`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.UserNotFound));
  });

  test('Rejects an invalid user ID', async () => {
    const response = await request(createApp())
      .get('/user/not-a-uuid/photo')
      .set('Authorization', authHeader);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject(errorBody(commonErrors.InvalidRequest));
    expect(mockedGetUserPhoto).not.toHaveBeenCalled();
  });
});