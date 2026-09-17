import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';

import { Server as SocketIOServer } from 'socket.io';

const COURSE_PIXEL_STREAM_URL = 'wss://8.229.22.124';
const RECONNECT_DELAY_MS = 1000;

// Relays the course-provided pixel stream to our own Socket.io clients
// verbatim, with no batching, delay, or reformatting, per Button 2's spec.
export function attachLiveUpdates(server: HttpServer | HttpsServer): void {
  const io = new SocketIOServer(server, { cors: { origin: '*' } });

  const connect = (): void => {
    const upstream = new WebSocket(COURSE_PIXEL_STREAM_URL);

    upstream.addEventListener('message', (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : '';
      try {
        const pixel = JSON.parse(data) as { x: number; y: number; color: string };
        io.emit('pixel', pixel);
      } catch {
        // Ignore any non-JSON payload rather than crashing the relay.
      }
    });

    upstream.addEventListener('close', () => {
      setTimeout(connect, RECONNECT_DELAY_MS);
    });

    upstream.addEventListener('error', () => {
      upstream.close();
    });
  };

  connect();
}
