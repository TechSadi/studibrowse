import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

describe('GET /api/health', () => {
  it('reports the database as up when connected', async () => {
    const res = await request(createApp({ isDatabaseConnected: () => true })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });

  it('reports the database as down when not connected', async () => {
    const res = await request(createApp({ isDatabaseConnected: () => false })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'down' });
  });
});
