import request from 'supertest';
import { createApp } from '../../src/app';
import { authErrors } from '../../src/auth/requireAuth';
import { signAccessToken } from '../../src/auth/tokens';
import { commonErrors, errorBody } from '../../src/errors';
import {
  addPreferredCourt,
  listPreferredCourts,
  removePreferredCourt,
} from '../../src/users/users.repository';

process.env.JWT_SECRET = 'test-jwt-secret';
const userId = '0b6d3a52-6a8e-4c1f-9d2e-1f3a4b5c6d7e';
const authHeader = `Bearer ${signAccessToken(userId)}`;

jest.mock('../../src/users/users.repository', () => ({
  addPreferredCourt: jest.fn(),
  listPreferredCourts: jest.fn(),
  removePreferredCourt: jest.fn(),
}));

const mockedAddPreferredCourt = jest.mocked(addPreferredCourt);
const mockedListPreferredCourts = jest.mocked(listPreferredCourts);
const mockedRemovePreferredCourt = jest.mocked(removePreferredCourt);

describe('Mocked: /user/me/preferred-courts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Adds each requested court without replacing other preferences', async () => {
    mockedAddPreferredCourt.mockResolvedValue(true);

    const firstResponse = await request(createApp())
      .put('/user/me/preferred-courts/12')
      .set('Authorization', authHeader);
    const secondResponse = await request(createApp())
      .put('/user/me/preferred-courts/13')
      .set('Authorization', authHeader);

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(204);
    expect(mockedAddPreferredCourt).toHaveBeenNthCalledWith(1, userId, 12);
    expect(mockedAddPreferredCourt).toHaveBeenNthCalledWith(2, userId, 13);
  });

  test('Removes only the requested court', async () => {
    mockedRemovePreferredCourt.mockResolvedValue(true);

    const response = await request(createApp())
      .delete('/user/me/preferred-courts/12')
      .set('Authorization', authHeader);

    expect(response.status).toBe(204);
    expect(mockedRemovePreferredCourt).toHaveBeenCalledWith(userId, 12);
  });

  test('Lists the signed-in user preferred courts', async () => {
    const preferredCourts = [
      { id: 12, name: 'Central Park', latitude: 49.2, longitude: -123.1 },
      { id: 13, name: 'Riverside Courts', latitude: 49.3, longitude: -123.2 },
    ];
    mockedListPreferredCourts.mockResolvedValue(preferredCourts);

    const response = await request(createApp())
      .get('/user/me/preferred-courts')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferredCourts });
    expect(mockedListPreferredCourts).toHaveBeenCalledWith(userId);
  });

  test('Returns an empty list when the user has no preferred courts', async () => {
    mockedListPreferredCourts.mockResolvedValue([]);

    const response = await request(createApp())
      .get('/user/me/preferred-courts')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferredCourts: [] });
  });

  test('Rejects an invalid court ID', async () => {
    const response = await request(createApp())
      .put('/user/me/preferred-courts/not-an-id')
      .set('Authorization', authHeader);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject(errorBody(commonErrors.InvalidRequest));
    expect(mockedAddPreferredCourt).not.toHaveBeenCalled();
  });

  test('Requires authentication for both mutations', async () => {
    const addResponse = await request(createApp()).put('/user/me/preferred-courts/12');
    const removeResponse = await request(createApp()).delete('/user/me/preferred-courts/12');

    expect(addResponse.status).toBe(401);
    expect(addResponse.body).toEqual(errorBody(authErrors.MissingToken));
    expect(removeResponse.status).toBe(401);
    expect(removeResponse.body).toEqual(errorBody(authErrors.MissingToken));
    expect(mockedAddPreferredCourt).not.toHaveBeenCalled();
    expect(mockedRemovePreferredCourt).not.toHaveBeenCalled();
  });

  test('Requires authentication to list preferred courts', async () => {
    const response = await request(createApp()).get('/user/me/preferred-courts');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorBody(authErrors.MissingToken));
    expect(mockedListPreferredCourts).not.toHaveBeenCalled();
  });

  test('Returns not found when the signed-in user no longer exists', async () => {
    mockedListPreferredCourts.mockResolvedValue(null);

    const response = await request(createApp())
      .get('/user/me/preferred-courts')
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.UserNotFound));
  });

  test('Returns not found when adding an unknown court', async () => {
    mockedAddPreferredCourt.mockResolvedValue(false);

    const response = await request(createApp())
      .put('/user/me/preferred-courts/12')
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.CourtNotFound));
  });

  test('Returns not found when removing an unknown court', async () => {
    mockedRemovePreferredCourt.mockResolvedValue(false);

    const response = await request(createApp())
      .delete('/user/me/preferred-courts/12')
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody(commonErrors.CourtNotFound));
  });
});