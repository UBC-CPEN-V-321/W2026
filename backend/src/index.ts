import { createApp } from './app';
import { startChatSocket } from './chat/socket/chatSocket';
import { env } from './core/config/env';
import { logInfo } from './core/logger';
import { startRatingReminders } from './review/ratingReminders';

const app = createApp();

const server = app.listen(env.port, () => {
  logInfo(`Server listening on port ${env.port}`);
});
const chatSocket = startChatSocket(env.wsPort);
const stopRatingReminders = startRatingReminders();

// stop taking requests, then send the signal again: the listener is gone (once),
// so Node handles it the default way and the process ends
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    chatSocket.close();
    stopRatingReminders();
    server.close(() => {
      process.kill(process.pid, signal);
    });
  });
}
