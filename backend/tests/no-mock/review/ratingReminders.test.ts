import * as push from '../../../src/core/notifications/push';
import { sendDueRatingReminders } from '../../../src/review/ratingReminders';
import { addUser, cleanUpAfterTests } from '../helpers';
import { addCompletedGame, addRating, setCompletedMinutesAgo, wasReminded } from './reviewHelpers';

/*  rating closes a day (1440 minutes) after the game is marked completed, and its players are
    reminded in the last hour. Other test files' games can be due at the same time, since they
    share the database, so each test only checks its own games
 */
const IN_LAST_HOUR = 1410;
const NOT_DUE_YET = 30;
const ALREADY_CLOSED = 1441;

let organizerId: number;
let aliceId: number;
let benId: number;
let nedId: number;
// watches who is sent a reminder. The real sendPushToUsers still runs: the test users have no
// devices, so nothing leaves the server
let sendPushToUsers: jest.SpyInstance<Promise<number>, [number[], push.PushMessage]>;

beforeEach(async () => {
  organizerId = await addUser('Olivia');
  aliceId = await addUser('Alice');
  benId = await addUser('Ben');
  nedId = await addUser('Ned');
  sendPushToUsers = jest.spyOn(push, 'sendPushToUsers');
});

afterEach(() => {
  jest.restoreAllMocks();
});

cleanUpAfterTests();

// the user ids each reminder for this game was sent to
function remindersFor(gameId: number): number[][] {
  return sendPushToUsers.mock.calls
    .filter(([, message]) => message.data?.gameId === String(gameId))
    .map(([userIds]) => [...userIds].sort((a, b) => a - b));
}

// The rating reminder the server checks for every minute
describe('Unmocked: rating reminders', () => {
  // Input: a game marked completed 23.5 hours ago with the organizer, Alice, Ben and Ned, who
  //   didn't show up. Alice already rated everyone. The check runs twice
  // Expected behavior: the organizer and Ben, who still have someone to rate, get one reminder
  //   that opens the game. Alice and Ned get none. The game is marked reminded, so the second
  //   check sends nothing more
  // Expected output: the reminder "Rating closes soon"
  test('Players with someone left to rate are reminded once', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId, benId, nedId], [nedId]);
    await setCompletedMinutesAgo(gameId, IN_LAST_HOUR);
    await addRating(gameId, aliceId, organizerId, 5);
    await addRating(gameId, aliceId, benId, 5);

    await sendDueRatingReminders();
    await sendDueRatingReminders();

    expect(remindersFor(gameId)).toEqual([[organizerId, benId].sort((a, b) => a - b)]);
    expect(sendPushToUsers).toHaveBeenCalledWith(expect.any(Array), {
      title: 'Rating closes soon',
      body: 'Rating for Evening Basketball closes in 1 hour, rate your teammates before it does',
      data: { type: 'rating_reminder', gameId: String(gameId) },
    });
    expect(await wasReminded(gameId)).toBe(true);
  });

  // Input: a game marked completed 30 minutes ago, and one marked completed 24 hours 1 minute
  //   ago, whose rating has closed. Nobody rated anyone
  // Expected behavior: neither game's players are reminded, and neither game is marked reminded
  // Expected output: no reminder for either game
  test('Games outside the last hour of rating are not reminded', async () => {
    const notDueGameId = await addCompletedGame(organizerId, [aliceId]);
    await setCompletedMinutesAgo(notDueGameId, NOT_DUE_YET);
    const closedGameId = await addCompletedGame(organizerId, [benId]);
    await setCompletedMinutesAgo(closedGameId, ALREADY_CLOSED);

    await sendDueRatingReminders();

    expect(remindersFor(notDueGameId)).toEqual([]);
    expect(remindersFor(closedGameId)).toEqual([]);
    expect(await wasReminded(notDueGameId)).toBe(false);
    expect(await wasReminded(closedGameId)).toBe(false);
  });

  // Input: a game marked completed 23.5 hours ago where the organizer and Alice rated each other
  // Expected behavior: the game is marked reminded, but nobody is notified
  // Expected output: no user gets a reminder
  test('Nobody is reminded when everyone already rated', async () => {
    const gameId = await addCompletedGame(organizerId, [aliceId]);
    await setCompletedMinutesAgo(gameId, IN_LAST_HOUR);
    await addRating(gameId, organizerId, aliceId, 5);
    await addRating(gameId, aliceId, organizerId, 5);

    await sendDueRatingReminders();

    expect(remindersFor(gameId).flat()).toEqual([]);
    expect(await wasReminded(gameId)).toBe(true);
  });
});