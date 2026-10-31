import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { useTestDatabase } from '../../test/testDb';
import { User } from './user.model';

useTestDatabase();

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

function check(username: string) {
  return request(app).get('/api/users/username-available').query({ u: username });
}

describe('GET /api/users/username-available', () => {
  beforeEach(async () => {
    await User.create({ name: 'Alex', username: 'alexsmith', email: 'alex@example.com' });
  });

  it('reports a free username as available', async () => {
    const res = await check('mayalee');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it('reports a taken username as unavailable, ignoring case', async () => {
    expect((await check('alexsmith')).body).toEqual({ available: false });
    expect((await check('AlexSmith')).body).toEqual({ available: false });
  });

  it('rejects a malformed username with 400 VALIDATION_ERROR', async () => {
    const res = await check('a b');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing username with 400', async () => {
    const res = await request(app).get('/api/users/username-available');
    expect(res.status).toBe(400);
  });
});
