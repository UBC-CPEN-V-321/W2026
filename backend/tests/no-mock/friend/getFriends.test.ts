import { addUser, api, asUser, cleanUpAfterTests, withToken } from '../helpers';
import { addFriendRequest, makeFriends } from './friendHelpers';

let userId: number;

beforeEach(async () => {
  userId = await addUser('Una');
});

cleanUpAfterTests();

// Interface GET /api/friends
describe('Unmocked: GET /api/friends', () => {
  // Input: no jwt_token, and a jwt_token that isn't a real token
  // Expected status code: 400 with no token, 401 with a bad token
  // Expected behavior: no friends are read
  // Expected output: { msg: "invalid_request" } and { msg: "invalid_token", error: "Invalid jwt_token" }
  test('Rejects a call that is not signed in', async () => {
    const noToken = await api.get('/api/friends');
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject({ msg: 'invalid_request' });

    const badToken = await api.get('/api/friends').set(withToken('not-a-real-token'));
    expect(badToken.status).toBe(401);
    expect(badToken.body).toEqual({ msg: 'invalid_token', error: 'Invalid jwt_token' });
  });

  // Input: a signed in user with no friends
  // Expected status code: 200
  // Expected behavior: nothing is listed
  // Expected output: { msg: "success", friends: [] }
  test('User has no friends', async () => {
    const response = await api.get('/api/friends').set(asUser(userId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ msg: 'success', friends: [] });
  });

  // Input: a signed in user with friends Zed, Amy and Mia, a pending request each way with
  //   two other users, and a stranger
  // Expected status code: 200
  // Expected behavior: only friends are listed, in first name order, each with the chat the
  //   two share. Pending requests and strangers aren't friends
  // Expected output: { msg: "success", friends } with Amy, Mia, Zed, each
  //   { user_id, first_name, last_name, chat_id }
  test('Friends are listed in name order with their chat', async () => {
    // 1. three friends, added out of name order, and users who aren't friends
    const zedId = await addUser('Zed');
    const amyId = await addUser('Amy');
    const miaId = await addUser('Mia');
    const zedChat = await makeFriends(userId, zedId);
    const amyChat = await makeFriends(userId, amyId);
    const miaChat = await makeFriends(miaId, userId);
    await addFriendRequest(userId, await addUser('Asked'));
    await addFriendRequest(await addUser('Asker'), userId);
    await addUser('Stranger');

    // 2. list the friends through the interface
    const response = await api.get('/api/friends').set(asUser(userId));

    // 3. check only the friends are listed, in name order
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      msg: 'success',
      friends: [
        { user_id: amyId, first_name: 'Amy', last_name: 'Tester', chat_id: amyChat },
        { user_id: miaId, first_name: 'Mia', last_name: 'Tester', chat_id: miaChat },
        { user_id: zedId, first_name: 'Zed', last_name: 'Tester', chat_id: zedChat },
      ],
    });
  });

  // Input: Una and Zed are friends, Zed lists his friends
  // Expected status code: 200
  // Expected behavior: a friendship shows for both users, with the same chat
  // Expected output: Zed's list holds Una with the chat_id Una sees for Zed
  test('Both friends see each other with the same chat', async () => {
    const zedId = await addUser('Zed');
    const chatId = await makeFriends(userId, zedId);

    const response = await api.get('/api/friends').set(asUser(zedId));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      msg: 'success',
      friends: [{ user_id: userId, first_name: 'Una', last_name: 'Tester', chat_id: chatId }],
    });
  });
});
