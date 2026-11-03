import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase, isDatabaseConnected } from './db/connect';
import { purgeRoomContent, startRoomCleanup } from './jobs/roomCleanup';
import { logger } from './lib/logger';
import { flushMonitoring, initMonitoring } from './lib/monitoring';
import { createStorageService } from './lib/storage';
import { createNotificationSender } from './modules/notifications/notifications.service';
import { createChatHandlers } from './realtime/handlers/chat.handlers';
import { createFollowHandlers } from './realtime/handlers/follow.handlers';
import { createGoalHandlers } from './realtime/handlers/goal.handlers';
import { createLobbyHandlers } from './realtime/handlers/lobby.handlers';
import { createResourceHandlers } from './realtime/handlers/resource.handlers';
import { createRoomHandlers } from './realtime/handlers/room.handlers';
import { createSettingsHandlers } from './realtime/handlers/settings.handlers';
import { createTimerHandlers } from './realtime/handlers/timer.handlers';
import { createIo } from './realtime/io';
import { broadcastRoomCard, resetLobby } from './realtime/lobby';
import { createRoomTimer } from './realtime/roomTimer';
import { userRoom } from './realtime/types';

// Render waits 30 s after SIGTERM before killing the process.
const SHUTDOWN_TIMEOUT_MS = 10_000;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

if (!initMonitoring(env) && env.NODE_ENV === 'production') {
  logger.warn('[monitoring] SENTRY_DSN is not set; errors are only logged, not tracked');
}

/** Set on SIGTERM/SIGINT. /api/health answers 503 from then on, so no new traffic is routed here. */
let shuttingDown = false;

const storage = createStorageService(env);
const app = createApp({
  isDatabaseConnected,
  isShuttingDown: () => shuttingDown,
  clientOrigin: env.CLIENT_ORIGIN,
  storage,
  // Only called for requests, which can't arrive before io exists.
  onRoomCreated: (roomId) => {
    broadcastRoomCard(io, roomId);
    notifications
      .roomOpened(roomId)
      .catch((err: unknown) => logger.error({ err, roomId }, '[notifications] failed to tell followers'));
  },
  // Their tabs drop, and the usual reconnect window then takes them out of their rooms.
  onAccountDeleted: (userId) => io.in(userRoom(userId)).disconnectSockets(true),
});
const httpServer = createServer(app);
const notifications = createNotificationSender({
  // Only called after something happened over a socket or a request, so io exists by then.
  emit: (userId, notification) => io.to(userRoom(userId)).emit('notification:new', { notification }),
});
const roomTimer = createRoomTimer({ onRoundEnded: notifications.roundEnded });
const roomHandlers = createRoomHandlers({
  onDepart: roomTimer.memberLeaving,
  onClosing: roomTimer.closing,
  onClosed: (roomId) => purgeRoomContent(storage, [roomId]),
  onJoined: async (roomId, userId) => {
    await notifications.memberJoined(roomId, userId);
    await notifications.roomFull(roomId);
  },
});
const io = createIo(httpServer, {
  clientOrigin: env.CLIENT_ORIGIN,
  registerHandlers: [
    roomHandlers.register,
    createTimerHandlers(roomTimer),
    createChatHandlers(),
    createGoalHandlers(),
    createResourceHandlers(storage),
    createSettingsHandlers(),
    createLobbyHandlers(),
    createFollowHandlers(),
  ],
});

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, '[server] listening');
});
let stopRoomCleanup: (() => void) | undefined;
// The first connection only: Mongoose reconnects by itself after that.
mongoose.connection.once('connected', () => {
  stopRoomCleanup = startRoomCleanup({
    storage,
    finalizeRun: roomTimer.finalizeOnClose,
    // Each one reads as closed and becomes rooms:remove; private ones stay out of the lobby.
    onClosed: (roomIds) => roomIds.forEach((roomId) => broadcastRoomCard(io, roomId)),
  });
  // Timers keep running in the database while the server is down; pick them up again.
  roomTimer
    .restore(io)
    .catch((err: unknown) => logger.error({ err }, '[rooms] failed to reschedule running timers'));
});
void connectToDatabase(env.MONGODB_URI);

/** Sends queued error reports and buffered log lines before the process exits. */
async function exit(code: number): Promise<never> {
  await flushMonitoring(SENTRY_FLUSH_TIMEOUT_MS).catch(() => undefined);
  logger.flush();
  process.exit(code);
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '[server] shutting down');

  setTimeout(() => {
    logger.error('[server] shutdown timed out, forcing exit');
    logger.flush();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    stopRoomCleanup?.();
    roomHandlers.dispose();
    roomTimer.dispose();
    resetLobby();
    // Closes every socket and the underlying HTTP server.
    await io.close();
    await disconnectFromDatabase();
    await exit(0);
  } catch (error) {
    logger.error({ err: error }, '[server] error during shutdown');
    await exit(1);
  }
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));

// A rejected promise nobody caught is a bug, but the process is still in a known state: report it and go on.
process.on('unhandledRejection', (reason) =>
  logger.error({ err: reason }, '[server] unhandled promise rejection'),
);
// After an uncaught exception the state is unknown, so report it and exit. Render starts a fresh instance.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[server] uncaught exception');
  void exit(1);
});
