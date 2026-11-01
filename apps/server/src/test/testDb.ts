import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../db/connect';

/**
 * Gives the calling test file its own in-memory MongoDB, with every model's indexes built
 * (so unique constraints apply) and every collection emptied before each test.
 */
export function useTestDatabase(): void {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectToDatabase(mongo.getUri());
    await mongoose.connection.syncIndexes();
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongo.stop();
  });
}
