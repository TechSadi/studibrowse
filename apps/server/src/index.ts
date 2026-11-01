import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase, isDatabaseConnected } from './db/connect';
import { startRoomCleanup } from './jobs/roomCleanup';
import { logger } from './lib/logger';
import { createRoomHandlers } from './realtime/handlers/room.handlers';
import { createTimerHandlers } from './realtime/handlers/timer.handlers';
import { createIo } from './realtime/io';
import { createRoomTimer } from './realtime/roomTimer';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp({ isDatabaseConnected, clientOrigin: env.CLIENT_ORIGIN });
const httpServer = createServer(app);
const roomHandlers = createRoomHandlers();
const roomTimer = createRoomTimer();
const io = createIo(httpServer, {
  clientOrigin: env.CLIENT_ORIGIN,
  registerHandlers: [roomHandlers.register, createTimerHandlers(roomTimer)],
});

httpServer.listen(env.PORT, () => {
  logger.info(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
let stopRoomCleanup: (() => void) | undefined;
// The first connection only: Mongoose reconnects by itself after that.
mongoose.connection.once('connected', () => {
  stopRoomCleanup = startRoomCleanup();
  // Timers keep running in the database while the server is down; pick them up again.
  roomTimer
    .restore(io)
    .catch((err: unknown) => logger.error({ err }, '[rooms] failed to reschedule running timers'));
});
void connectToDatabase(env.MONGODB_URI);

let shuttingDown = false;

/** Flushes buffered log lines before the process exits. */
function exit(code: number): never {
  logger.flush();
  process.exit(code);
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[server] ${signal} received, shutting down`);

  setTimeout(() => {
    logger.error('[server] shutdown timed out, forcing exit');
    exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    stopRoomCleanup?.();
    roomHandlers.dispose();
    roomTimer.dispose();
    // Closes every socket and the underlying HTTP server.
    await io.close();
    await disconnectFromDatabase();
    exit(0);
  } catch (error) {
    logger.error({ err: error }, '[server] error during shutdown');
    exit(1);
  }
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
