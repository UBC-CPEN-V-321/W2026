import * as push from '../../../src/core/notifications/push';
import * as ratingsDb from '../../../src/review/db/ratings';
import { sendDueRatingReminders } from '../../../src/review/ratingReminders';
import type * as MockEnv from '../mockEnv';
import { cleanUpAfterTests } from '../helpers';

jest.mock('../../../src/core/config/env', () => jest.requireActual<typeof MockEnv>('../mockEnv'));

cleanUpAfterTests();

// The rating reminder the server sends an hour before rating a completed game closes
describe('Mocked: rating reminders', () => {
  // Mocked behavior: claimDueRatingReminders returns games 42 and 43 as due,
  //   getPlayersWithRatingsLeft says who still has someone to rate, and sendPushToUsers is replaced
  // Input: the server's check for due reminders runs
  // Expected behavior: each due game's players with someone left to rate get one reminder
  //   that opens the game
  // Expected output: 2, the number of games reminded
  test('Players with someone left to rate are reminded', async () => {
    jest.spyOn(ratingsDb, 'claimDueRatingReminders').mockResolvedValue([
      { gameId: 42, title: 'Sunday Soccer' },
      { gameId: 43, title: 'Monday Hoops' },
    ]);
    jest.spyOn(ratingsDb, 'getPlayersWithRatingsLeft')
      .mockImplementation((gameId) => Promise.resolve(gameId === 42 ? [2, 3] : [5]));
    const sendPushToUsers = jest.spyOn(push, 'sendPushToUsers').mockResolvedValue(1);

    const reminded = await sendDueRatingReminders();

    expect(reminded).toBe(2);
    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    expect(sendPushToUsers).toHaveBeenCalledWith([2, 3], {
      title: 'Rating closes soon',
      body: 'Rating for Sunday Soccer closes in 1 hour, rate your teammates before it does',
      data: { type: 'rating_reminder', gameId: '42' },
    });
    expect(sendPushToUsers).toHaveBeenCalledWith([5], expect.objectContaining({
      data: { type: 'rating_reminder', gameId: '43' },
    }));
  });

  // Mocked behavior: claimDueRatingReminders returns no games, as when every due game
  //   was already reminded
  // Input: the server's check for due reminders runs
  // Expected behavior: nobody is notified
  // Expected output: 0
  test('Nothing is sent when no reminder is due', async () => {
    jest.spyOn(ratingsDb, 'claimDueRatingReminders').mockResolvedValue([]);
    const sendPushToUsers = jest.spyOn(push, 'sendPushToUsers').mockResolvedValue(0);

    const reminded = await sendDueRatingReminders();

    expect(reminded).toBe(0);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});
