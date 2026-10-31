import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase, isDatabaseConnected } from './db/connect';
import { createIo } from './realtime/io';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp({ isDatabaseConnected });
const httpServer = createServer(app);
const io = createIo(httpServer, env.CLIENT_ORIGIN);

httpServer.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
void connectToDatabase(env.MONGODB_URI);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error('[server] shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // Closes every socket and the underlying HTTP server.
    await io.close();
    await disconnectFromDatabase();
    process.exit(0);
  } catch (error) {
    console.error('[server] error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
