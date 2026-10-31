import mongoose from 'mongoose';

const RETRY_DELAY_MS = 5000;

let retryTimer: NodeJS.Timeout | undefined;

/**
 * Connects to MongoDB. If the first attempt fails it keeps retrying in the background,
 * so the server still boots and /api/health reports the database as down.
 * After the first connection, Mongoose handles reconnects itself.
 */
export async function connectToDatabase(uri: string): Promise<void> {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: RETRY_DELAY_MS });
    console.log('[db] connected');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[db] connection failed (${reason}), retrying in ${RETRY_DELAY_MS / 1000}s`);
    retryTimer = setTimeout(() => void connectToDatabase(uri), RETRY_DELAY_MS);
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectFromDatabase(): Promise<void> {
  clearTimeout(retryTimer);
  await mongoose.disconnect();
  console.log('[db] disconnected');
}

mongoose.connection.on('disconnected', () => console.warn('[db] lost connection'));
mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));
