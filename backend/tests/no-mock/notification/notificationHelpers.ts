import { executeWrite, selectRows } from '../../../src/core/db/mysql';
import { type NotificationType } from '../../../src/notification/db/notifications';

// setup and checks shared by the unmocked notification tests, straight on the database

export interface TestNotification {
  type?: NotificationType;
  title?: string;
  body?: string;
  gameId?: number | null;
  // when it was made, e.g. "2026-01-01 10:00:00", so tests can check the order. Now by default
  createdAt?: string | null;
  // when it was read, e.g. "2026-01-02 10:00:00", null while unread
  readAt?: string | null;
}

/*  saves a notification for the user straight in the table and returns its id. By default
    an unread "Friend request accepted" one made now, with overrides for what the test is about
 */
export async function addNotification(userId: number, notification: TestNotification = {}): Promise<number> {
  const { insertId } = await executeWrite(
    `INSERT INTO notifications (user_id, type, title, body, game_id, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
    [
      userId,
      notification.type ?? 'friend_request_accepted',
      notification.title ?? 'Friend request accepted',
      notification.body ?? 'Sam accepted your friend request',
      notification.gameId ?? null,
      notification.createdAt ?? null,
      notification.readAt ?? null,
    ],
  );
  return insertId;
}

// saves count unread notifications for the user, all made at the same time
export async function addNotifications(userId: number, count: number): Promise<void> {
  const rows = Array<string>(count).fill("(?, 'friend_request_accepted', 'Title', 'Body')").join(', ');
  await executeWrite(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ${rows}`,
    Array<number>(count).fill(userId),
  );
}

export interface SavedNotificationRow {
  notification_id: number;
  // selected as a string so the exact value saved can be compared
  read_at: string | null;
}

// the user's notifications really saved, oldest id first, with when each was read
export async function getSavedNotifications(userId: number): Promise<SavedNotificationRow[]> {
  return selectRows<SavedNotificationRow>(
    `SELECT notification_id, DATE_FORMAT(read_at, '%Y-%m-%d %H:%i:%s') AS read_at
     FROM notifications WHERE user_id = ? ORDER BY notification_id`,
    [userId],
  );
}
