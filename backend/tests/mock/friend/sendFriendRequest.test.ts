import * as logger from '../../../src/core/logger';
import * as push from '../../../src/core/notifications/push';
import * as friendsDb from '../../../src/friend/db/friends';
import type * as MockEnv from '../mockEnv';
import {
  api,
  cleanUpAfterTests,
  letNotificationsFinish,
  signIn,
  testOrganizer,
  testPlayer,
  withToken,
} from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

const REQUEST_ID = 7;

cleanUpAfterTests();

// Interface POST /api/friends/requests
describe('Mocked: POST /api/friends/requests', () => {
  // Mocked behavior: sendFriendRequest throws, as if the database failed.
  //   Sign in is mocked only so the route can run
  // Input: Olivia sends a request to Paul ({ user_id: 2 })
  // Expected status code: 500
  // Expected behavior: the error is handled and nobody is notified
  // Expected output: { msg: "server_error", error: "Could not send your friend request, try again later" }
  test('Database fails', async () => {
    // 1. sign in (not what this test checks)
    const sender = testOrganizer();
    const token = signIn(sender);
    const receiver = testPlayer();

    // 2. make saving the request fail
    const sendFriendRequest = jest.spyOn(friendsDb, 'sendFriendRequest').mockRejectedValue(new Error('database down'));
    const sendPushToUser = jest.spyOn(push, 'sendPushToUser').mockResolvedValue(1);

    // 3. send the request through the interface
    const response = await api.post('/api/friends/requests').set(withToken(token)).send({ user_id: receiver.userId });

    // 4. check the error reply
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      msg: 'server_error',
      error: 'Could not send your friend request, try again later',
    });
    expect(sendFriendRequest).toHaveBeenCalledWith(sender.userId, receiver.userId);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  // Mocked behavior: sendFriendRequest saves nothing and reports a new request 7.
  //   sendPushToUser is replaced to check who is told. Sign in is mocked only so the route can run
  // Input: Olivia sends a request to Paul ({ user_id: 2 })
  // Expected status code: 201
  // Expected behavior: Paul gets a friend_request notification naming Olivia
  // Expected output: { msg: "success", request: { request_id: 7, user_id: 2, status: "pending" } }
  test('Receiver is told', async () => {
    // 1. sign in as the sender (not what this test checks)
    const sender = testOrganizer();
    const token = signIn(sender);
    const receiver = testPlayer();

    // 2. a request that saves successfully
    jest.spyOn(friendsDb, 'sendFriendRequest').mockResolvedValue({ ok: true, requestId: REQUEST_ID });
    const sendPushToUser = jest.spyOn(push, 'sendPushToUser').mockResolvedValue(1);

    // 3. send the request through the interface
    const response = await api.post('/api/friends/requests').set(withToken(token)).send({ user_id: receiver.userId });

    // 4. check the reply and the notification
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      msg: 'success',
      request: { request_id: REQUEST_ID, user_id: receiver.userId, status: 'pending' },
    });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(receiver.userId, {
      title: 'New friend request',
      body: `${sender.firstName} sent you a friend request`,
      data: { type: 'friend_request' },
    });
  });

  // Mocked behavior: sendFriendRequest saves nothing and reports a new request 7.
  //   sendPushToUser fails, as if Firebase were down. logError is watched to check the
  //   failure is logged. Sign in is mocked only so the route can run
  // Input: Olivia sends a request to Paul ({ user_id: 2 })
  // Expected status code: 201, the notification is best effort
  // Expected behavior: the request is still sent and the failed notification is logged
  // Expected output: { msg: "success", request: { request_id: 7, user_id: 2, status: "pending" } }
  test('Notification fails', async () => {
    // 1. sign in as the sender (not what this test checks)
    const token = signIn(testOrganizer());
    const receiver = testPlayer();

    // 2. a request that saves, and a notification that fails
    const failure = new Error('firebase down');
    jest.spyOn(friendsDb, 'sendFriendRequest').mockResolvedValue({ ok: true, requestId: REQUEST_ID });
    jest.spyOn(push, 'sendPushToUser').mockRejectedValue(failure);
    const logError = jest.spyOn(logger, 'logError').mockImplementation(() => undefined);

    // 3. send the request through the interface, and let the notification finish
    const response = await api.post('/api/friends/requests').set(withToken(token)).send({ user_id: receiver.userId });
    await letNotificationsFinish();

    // 4. check the reply and that the failure was logged
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      msg: 'success',
      request: { request_id: REQUEST_ID, user_id: receiver.userId, status: 'pending' },
    });
    expect(logError).toHaveBeenCalledWith('Sending a notification failed:', failure);
  });
});
