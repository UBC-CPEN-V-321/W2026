import { addUser, api, asUser, cleanUpAfterTests, withToken } from '../helpers';
import { addFriendRequest, getFriendRequest, getFriendRequestsBetween, makeFriends, MISSING_ID } from './friendHelpers';

let senderId: number;
let receiverId: number;

beforeEach(async () => {
  senderId = await addUser('Sid');
  receiverId = await addUser('Rae');
});

cleanUpAfterTests();

// Interface POST /api/friends/requests
describe('Unmocked: POST /api/friends/requests', () => {
  // Input: { user_id } of a real user, with no jwt_token and with a jwt_token that isn't a real token
  // Expected status code: 400 with no token, 401 with a bad token
  // Expected behavior: no request is saved
  // Expected output: { msg: "invalid_request" } and { msg: "invalid_token", error: "Invalid jwt_token" }
  test('Rejects a call that is not signed in', async () => {
    const noToken = await api.post('/api/friends/requests').send({ user_id: receiverId });
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject({ msg: 'invalid_request' });

    const badToken = await api.post('/api/friends/requests').set(withToken('not-a-real-token'))
      .send({ user_id: receiverId });
    expect(badToken.status).toBe(401);
    expect(badToken.body).toEqual({ msg: 'invalid_token', error: 'Invalid jwt_token' });

    expect(await getFriendRequestsBetween(senderId, receiverId)).toEqual([]);
  });

  // Input: no body, no user_id, or a user_id that is text, 0, negative, a decimal, or too
  //   big for an id
  // Expected status code: 400
  // Expected behavior: no request is saved
  // Expected output: { msg: "invalid_request", error: "user_id must be a positive whole number" }
  test.each([
    ['no body', undefined],
    ['no user_id', {}],
    ['user_id as text', { user_id: '5' }],
    ['user_id 0', { user_id: 0 }],
    ['negative user_id', { user_id: -1 }],
    ['decimal user_id', { user_id: 1.5 }],
    ['user_id too big', { user_id: 4294967296 }],
  ])('Bad user_id: %s', async (_name, body) => {
    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ msg: 'invalid_request', error: 'user_id must be a positive whole number' });
    expect(await getFriendRequestsBetween(senderId, receiverId)).toEqual([]);
  });

  // Input: the user sends a request to their own user_id
  // Expected status code: 409
  // Expected behavior: no request is saved
  // Expected output: { msg: "own_request", error: "You can't send a friend request to yourself" }
  test('Cannot send a request to yourself', async () => {
    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: senderId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ msg: 'own_request', error: "You can't send a friend request to yourself" });
    expect(await getFriendRequestsBetween(senderId, senderId)).toEqual([]);
  });

  // Input: a user_id no user has
  // Expected status code: 404
  // Expected behavior: no request is saved
  // Expected output: { msg: "user_not_found", error: "This user does not exist" }
  test('User does not exist', async () => {
    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: MISSING_ID });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ msg: 'user_not_found', error: 'This user does not exist' });
    expect(await getFriendRequestsBetween(senderId, MISSING_ID)).toEqual([]);
  });

  // Input: a request to someone who is already the user's friend
  // Expected status code: 409
  // Expected behavior: no request is saved
  // Expected output: { msg: "already_friends", error: "You're already friends" }
  test('Already friends', async () => {
    await makeFriends(senderId, receiverId);

    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: receiverId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ msg: 'already_friends', error: "You're already friends" });
    expect(await getFriendRequestsBetween(senderId, receiverId)).toEqual([]);
  });

  // Input: a second request to someone the user already has a pending request to
  // Expected status code: 409
  // Expected behavior: the first request stays as the only one, still pending
  // Expected output: { msg: "already_requested", error: "You already sent this person a friend request" }
  test('Already sent a request', async () => {
    const requestId = await addFriendRequest(senderId, receiverId);

    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: receiverId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ msg: 'already_requested', error: 'You already sent this person a friend request' });
    const saved = await getFriendRequestsBetween(senderId, receiverId);
    expect(saved.map((request) => [request.request_id, request.status])).toEqual([[requestId, 'pending']]);
  });

  // Input: a request to someone who already has a pending request to the user
  // Expected status code: 409
  // Expected behavior: no request is saved the other way, theirs stays pending
  // Expected output: { msg: "request_received", error: "This person already sent you a friend request" }
  test('Already received a request from them', async () => {
    const theirRequestId = await addFriendRequest(receiverId, senderId);

    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: receiverId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ msg: 'request_received', error: 'This person already sent you a friend request' });
    expect(await getFriendRequestsBetween(senderId, receiverId)).toEqual([]);
    expect((await getFriendRequest(theirRequestId))?.status).toBe('pending');
  });

  // Input: { user_id } of a user with no friendship or request with the sender
  // Expected status code: 201
  // Expected behavior: a pending request from the sender to the receiver is saved. The
  //   receiver has no device, so no notification is sent
  // Expected output: { msg: "success", request: { request_id, user_id, status: "pending" } }
  test('Sends a request', async () => {
    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: receiverId });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      msg: 'success',
      request: { request_id: expect.any(Number) as number, user_id: receiverId, status: 'pending' },
    });
    const requestId = (response.body as { request: { request_id: number } }).request.request_id;
    expect(await getFriendRequest(requestId)).toEqual({
      request_id: requestId,
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      answered: 0,
    });
  });

  // Input: a request to someone who declined the sender's earlier request
  // Expected status code: 201
  // Expected behavior: the earlier request is reused: pending again and no longer answered,
  //   no second request is saved
  // Expected output: { msg: "success", request } with the earlier request's id
  test('Asks again after being declined', async () => {
    const declinedId = await addFriendRequest(senderId, receiverId, 'declined');

    const response = await api.post('/api/friends/requests').set(asUser(senderId)).send({ user_id: receiverId });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      msg: 'success',
      request: { request_id: declinedId, user_id: receiverId, status: 'pending' },
    });
    const saved = await getFriendRequestsBetween(senderId, receiverId);
    expect(saved.map((request) => [request.request_id, request.status, request.answered]))
      .toEqual([[declinedId, 'pending', 0]]);
  });
});
