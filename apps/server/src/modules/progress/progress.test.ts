import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Session } from '../sessions/session.model';

useTestDatabase();

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

function summary(token: string, query: Record<string, string> = {}) {
  return request(app).get('/api/progress/summary').query(query).set('Authorization', `Bearer ${token}`);
}

describe('GET /api/progress/summary', () => {
  it('needs you to be logged in', async () => {
    expect((await request(app).get('/api/progress/summary')).status).toBe(401);
  });

  it('rejects a range it doesn’t know', async () => {
    const { token } = await createUserWithToken();
    const res = await summary(token, { range: 'year' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers this week, with today’s session in it', async () => {
    const { user, token } = await createUserWithToken({
      weeklyGoalMins: 720,
      streak: { current: 2, longest: 5 },
      lastStudiedAt: new Date(),
    });
    await Session.create({
      roomId: new Types.ObjectId(),
      roomName: 'Finals week focus',
      startedAt: new Date(),
      endedAt: new Date(),
      participants: [{ userId: user.id, focusedMins: 25 }],
    });

    const res = await summary(token, { range: 'week' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      range: 'week',
      week: { focusMins: 25, goalMins: 720, sessions: 1, people: 0, rooms: 1 },
      lastWeek: { focusMins: 0 },
      streak: { current: 2, longest: 5, studiedToday: true },
    });
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days.find((day: { date: string }) => day.date === res.body.today).focusMins).toBe(25);
  });
});
