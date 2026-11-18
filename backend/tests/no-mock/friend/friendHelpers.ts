import { executeWrite, selectRows } from '../../../src/core/db/mysql';
import { addFriends } from '../helpers';

// setup and checks shared by the unmocked friend tests, straight on the database

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

// an id far above any id the tests create
export const MISSING_ID = 999999999;

/*  saves a friend request and returns its id. createdAt ("2026-01-01 10:00:00") fixes when
    it was sent, so tests can check the order, otherwise it's now
 */
export async function addFriendRequest(
  senderId: number,
  receiverId: number,
  status: FriendRequestStatus = 'pending',
  createdAt: string | null = null,
): Promise<number> {
  const { insertId } = await executeWrite(
    `INSERT INTO friend_requests (sender_id, receiver_id, status, created_at, responded_at)
     VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), IF(? = 'pending', NULL, CURRENT_TIMESTAMP))`,
    [senderId, receiverId, status, createdAt, status],
  );
  return insertId;
}

// makes two users friends with their chat, as accepting a request does. Returns the chat's id
export async function makeFriends(userId: number, otherUserId: number): Promise<number> {
  await addFriends(userId, otherUserId);
  const { insertId } = await executeWrite(
    'INSERT INTO chats (user_low_id, user_high_id) VALUES (LEAST(?, ?), GREATEST(?, ?))',
    [userId, otherUserId, userId, otherUserId],
  );
  return insertId;
}

export interface SavedFriendRequest {
  request_id: number;
  sender_id: number;
  receiver_id: number;
  status: FriendRequestStatus;
  answered: number;
}

// the friend request really saved, undefined if there is none
export async function getFriendRequest(requestId: number): Promise<SavedFriendRequest | undefined> {
  const rows = await selectRows<SavedFriendRequest>(
    `SELECT request_id, sender_id, receiver_id, status, responded_at IS NOT NULL AS answered
     FROM friend_requests WHERE request_id = ?`,
    [requestId],
  );
  return rows[0];
}

// every friend request really saved from senderId to receiverId
export async function getFriendRequestsBetween(senderId: number, receiverId: number): Promise<SavedFriendRequest[]> {
  return selectRows<SavedFriendRequest>(
    `SELECT request_id, sender_id, receiver_id, status, responded_at IS NOT NULL AS answered
     FROM friend_requests WHERE sender_id = ? AND receiver_id = ?`,
    [senderId, receiverId],
  );
}

// how many friendship rows link the two users: 2 when they're friends (one each way), 0 when not
export async function countFriendshipRows(userId: number, otherUserId: number): Promise<number> {
  const rows = await selectRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM friendships
     WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
    [userId, otherUserId, otherUserId, userId],
  );
  return Number(rows[0]?.total ?? 0);
}

// the ids of the chats the two users share as friends
export async function getFriendChatIds(userId: number, otherUserId: number): Promise<number[]> {
  const rows = await selectRows<{ chat_id: number }>(
    'SELECT chat_id FROM chats WHERE user_low_id = LEAST(?, ?) AND user_high_id = GREATEST(?, ?)',
    [userId, otherUserId, userId, otherUserId],
  );
  return rows.map((row) => row.chat_id);
}
