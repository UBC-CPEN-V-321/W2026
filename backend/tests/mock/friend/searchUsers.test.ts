import * as friendsDb from '../../../src/friend/db/friends';
import type * as MockEnv from '../mockEnv';
import { api, cleanUpAfterTests, signIn, testOrganizer, withToken } from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

cleanUpAfterTests();

// Interface GET /api/users/search
describe('Mocked: GET /api/users/search', () => {
  // Mocked behavior: searchUsers throws, as if the database failed.
  //   Sign in is mocked only so the route can run
  // Input: a signed in user searches for "  Paul  "
  // Expected status code: 500
  // Expected behavior: the error is handled, searchUsers was asked for the trimmed text
  //   and the signed in user's id
  // Expected output: { msg: "server_error", error: "Could not search for users, try again later" }
  test('Database fails', async () => {
    // 1. sign in (not what this test checks)
    const user = testOrganizer();
    const token = signIn(user);

    // 2. make the search fail
    const searchUsers = jest.spyOn(friendsDb, 'searchUsers').mockRejectedValue(new Error('database down'));

    // 3. search through the interface
    const response = await api.get('/api/users/search').set(withToken(token)).query({ q: '  Paul  ' });

    // 4. check the error reply
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ msg: 'server_error', error: 'Could not search for users, try again later' });
    expect(searchUsers).toHaveBeenCalledWith('Paul', user.userId);
  });
});
