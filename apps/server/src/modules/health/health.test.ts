import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { connectToDatabase, disconnectFromDatabase, isDatabaseConnected } from '../../db/connect';

const app = createApp({ isDatabaseConnected, clientOrigin: 'http://localhost:5173' });
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectToDatabase(mongo.getUri());
});

afterAll(async () => {
  await disconnectFromDatabase();
  await mongo.stop();
});

// These run in order: connected first, then after disconnecting.
describe('GET /api/health', () => {
  it('reports the database as up when connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });

  it('reports the database as down after it disconnects', async () => {
    await disconnectFromDatabase();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'down' });
  });
});
