import { addUser, api, asUser, cleanUpAfterTests, withToken } from '../helpers';
import { addFriendRequest } from './friendHelpers';

let userId: number;

beforeEach(async () => {
  userId = await addUser('Una');
});

cleanUpAfterTests();

// Interface GET /api/friends/requests
describe('Unmocked: GET /api/friends/requests', () => {
  // Input: no jwt_token, and a jwt_token that isn't a real token
  // Expected status code: 400 with no token, 401 with a bad token
  // Expected behavior: no requests are read
  // Expected output: { msg: "invalid_request" } and { msg: "invalid_token", error: "Invalid jwt_token" }
  test('Rejects a call that is not signed in', async () => {
    const noToken = await api.get('/api/friends/requests');
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject({ msg: 'invalid_request' });

    const badToken = await api.get('/api/friends/requests').set(withToken('not-a-real-token'));
    expect(badToken.status).toBe(401);
    expect(badToken.body).toEqual({ msg: 'invalid_token', error: 'Invalid jwt_token' });
  });

  // Input: a signed in user nobody has sent a request to
  // Expected status code: 200
  // Expected behavior: nothing is listed
  // Expected output: { msg: "success", requests: [] }
  test('User has no requests', async () => {
    const response = await api.get('/api/friends/requests').set(asUser(userId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ msg: 'success', requests: [] });
  });

  // Input: pending requests to the user from Amy (oldest), Bob, and Cal and Dee (sent at the
  //   same time, Dee's saved last)
  // Expected status code: 200
  // Expected behavior: newest first, and requests sent at the same time newest id first
  // Expected output: { msg: "success", requests } in the order Dee, Cal, Bob, Amy, each
  //   { request_id, sender: { user_id, first_name, last_name } }
  test('Pending requests are listed newest first', async () => {
    // 1. requests sent at known times
    const amyId = await addUser('Amy');
    const bobId = await addUser('Bob');
    const calId = await addUser('Cal');
    const deeId = await addUser('Dee');
    const amyRequest = await addFriendRequest(amyId, userId, 'pending', '2026-01-01 10:00:00');
    const bobRequest = await addFriendRequest(bobId, userId, 'pending', '2026-01-02 10:00:00');
    const calRequest = await addFriendRequest(calId, userId, 'pending', '2026-01-03 10:00:00');
    const deeRequest = await addFriendRequest(deeId, userId, 'pending', '2026-01-03 10:00:00');

    // 2. list the requests through the interface
    const response = await api.get('/api/friends/requests').set(asUser(userId));

    // 3. check the order and what each request holds
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      msg: 'success',
      requests: [
        { request_id: deeRequest, sender: { user_id: deeId, first_name: 'Dee', last_name: 'Tester' } },
        { request_id: calRequest, sender: { user_id: calId, first_name: 'Cal', last_name: 'Tester' } },
        { request_id: bobRequest, sender: { user_id: bobId, first_name: 'Bob', last_name: 'Tester' } },
        { request_id: amyRequest, sender: { user_id: amyId, first_name: 'Amy', last_name: 'Tester' } },
      ],
    });
  });

  // Input: requests to the user that were accepted or declined, a pending request the user
  //   sent, a pending request between two other users, and one pending request to the user
  // Expected status code: 200
  // Expected behavior: only requests to the user still waiting for an answer are listed
  // Expected output: { msg: "success", requests } holding only the one pending request to the user
  test('Only pending requests to the user are listed', async () => {
    const pendingSenderId = await addUser('Pat');
    const otherId = await addUser('Oli');
    await addFriendRequest(await addUser('Acc'), userId, 'accepted');
    await addFriendRequest(await addUser('Dec'), userId, 'declined');
    await addFriendRequest(userId, await addUser('Asked'), 'pending');
    await addFriendRequest(otherId, pendingSenderId, 'pending');
    const pendingRequest = await addFriendRequest(pendingSenderId, userId, 'pending');

    const response = await api.get('/api/friends/requests').set(asUser(userId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      msg: 'success',
      requests: [
        { request_id: pendingRequest, sender: { user_id: pendingSenderId, first_name: 'Pat', last_name: 'Tester' } },
      ],
    });
  });
});
