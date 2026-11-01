import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES } from '@studibrowse/shared';
import { createApp } from '../../app';
import { createDisabledStorageService } from '../../lib/storage/disabledStorageService';
import { addSocket, resetPresence } from '../../realtime/presence';
import { createUserWithToken } from '../../test/authHelpers';
import { createFakeStorage } from '../../test/fakeStorage';
import { useTestDatabase } from '../../test/testDb';

useTestDatabase();
afterEach(resetPresence);

const base = { isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' };
const app = createApp({ ...base, storage: createFakeStorage() });
const roomId = '64b7f0c2a1b2c3d4e5f60718';
const pdf = { fileName: 'Lecture 9.pdf', size: 2048, contentType: 'application/pdf' };

function sign(token: string | null, body: object = pdf, target = app, id = roomId) {
  const req = request(target).post(`/api/rooms/${id}/uploads/sign`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.send(body);
}

/** A signed-in user who has joined the room (presence is what makes someone a member). */
async function member() {
  const { user, token } = await createUserWithToken();
  addSocket(roomId, `socket-${user.id}`, {
    userId: user.id,
    profile: { name: user.name, username: user.username, avatarColor: 'green' },
    status: 'focusing',
    maxSize: 10,
    hostId: user.id,
    now: new Date(),
  });
  return token;
}

describe('POST /api/rooms/:id/uploads/sign', () => {
  it('signs an upload into the room’s folder for a member', async () => {
    const res = await sign(await member());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      uploadUrl: 'https://files.test/upload',
      fields: { folder: roomId, signature: 'signed' },
    });
  });

  it('needs a signed-in member', async () => {
    expect((await sign(null)).status).toBe(401);
    const { token } = await createUserWithToken();
    const res = await sign(token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'NOT_A_MEMBER', message: 'Join the room first.' } });
  });

  it('refuses other file types, oversized files and bad room ids before signing', async () => {
    const token = await member();
    for (const body of [
      { ...pdf, contentType: 'application/zip' },
      { ...pdf, size: MAX_FILE_BYTES + 1 },
      { ...pdf, fileName: '' },
      { ...pdf, folder: 'elsewhere' },
    ]) {
      const res = await sign(token, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await sign(token, pdf, app, 'not-a-room')).status).toBe(400);
  });

  it('answers 503 when uploads aren’t configured', async () => {
    const disabled = createApp({ ...base, storage: createDisabledStorageService() });
    const res = await sign(await member(), pdf, disabled);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('UPLOADS_UNAVAILABLE');
  });
});
