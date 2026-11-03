import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { connectToDatabase, disconnectFromDatabase, isDatabaseConnected } from '../../db/connect';

let shuttingDown = false;
const app = createApp({
  isDatabaseConnected,
  isShuttingDown: () => shuttingDown,
  clientOrigin: 'http://localhost:5173',
});
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectToDatabase(mongo.getUri());
});

afterAll(async () => {
  await disconnectFromDatabase();
  await mongo.stop();
});

// These run in order: connected first, then shutting down, then after disconnecting.
describe('GET /api/health', () => {
  it('answers 200 when the database is up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });

  it('shows the deployed commit when there is one', async () => {
    const released = createApp({
      isDatabaseConnected,
      release: 'abc123',
      clientOrigin: 'http://localhost:5173',
    });
    const res = await request(released).get('/api/health');
    expect(res.body).toEqual({ ok: true, db: 'up', release: 'abc123' });
  });

  it('answers 503 while the server is shutting down', async () => {
    shuttingDown = true;
    const res = await request(app).get('/api/health');
    shuttingDown = false;
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: 'up' });
  });

  it('answers 503 after the database disconnects', async () => {
    await disconnectFromDatabase();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: 'down' });
  });
});
