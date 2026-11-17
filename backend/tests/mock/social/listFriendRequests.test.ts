import * as friendsDb from '../../../src/friend/db/friends';
import type * as MockEnv from '../mockEnv';
import { api, cleanUpAfterTests, signIn, testOrganizer, withToken } from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

cleanUpAfterTests();

// Interface GET /api/friends/requests
describe('Mocked: GET /api/friends/requests', () => {
  // Mocked behavior: getIncomingFriendRequests throws, as if the database failed.
  //   Sign in is mocked only so the route can run
  // Input: a signed in user lists the friend requests sent to them
  // Expected status code: 500
  // Expected behavior: the error is handled, the requests were asked for the signed in user
  // Expected output: { msg: "server_error", error: "Could not load your friend requests, try again later" }
  test('Database fails', async () => {
    // 1. sign in (not what this test checks)
    const user = testOrganizer();
    const token = signIn(user);

    // 2. make reading the requests fail
    const getIncomingFriendRequests = jest.spyOn(friendsDb, 'getIncomingFriendRequests')
      .mockRejectedValue(new Error('database down'));

    // 3. list the requests through the interface
    const response = await api.get('/api/friends/requests').set(withToken(token));

    // 4. check the error reply
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      msg: 'server_error',
      error: 'Could not load your friend requests, try again later',
    });
    expect(getIncomingFriendRequests).toHaveBeenCalledWith(user.userId);
  });
});
