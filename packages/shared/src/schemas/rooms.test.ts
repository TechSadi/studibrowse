import { describe, expect, it } from 'vitest';
import {
  createRoomSchema,
  inviteCodeParamsSchema,
  publicRoomsQuerySchema,
  roomIdParamsSchema,
} from './rooms';

const timerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};

const valid = { name: 'Finals week focus', isPublic: true, maxSize: 10, timerSettings };

function withTimer(field: string, value: number) {
  return { ...valid, timerSettings: { ...timerSettings, [field]: value } };
}

describe('createRoomSchema', () => {
  it('accepts a room and fills in the optional fields', () => {
    expect(createRoomSchema.parse(valid)).toEqual({ ...valid, subject: '', description: '', goals: [] });
  });

  it('trims the name, subject and goals', () => {
    const room = createRoomSchema.parse({ ...valid, name: '  Grind ', subject: ' Law ', goals: [' Ch. 4 '] });
    expect(room).toMatchObject({ name: 'Grind', subject: 'Law', goals: ['Ch. 4'] });
  });

  it.each([2, 20])('accepts a size of %i', (maxSize) => {
    expect(createRoomSchema.safeParse({ ...valid, maxSize }).success).toBe(true);
  });

  it.each([1, 21, 10.5])('rejects a size of %s', (maxSize) => {
    expect(createRoomSchema.safeParse({ ...valid, maxSize }).success).toBe(false);
  });

  it.each([
    ['focusMins', 5, 90],
    ['shortBreakMins', 1, 30],
    ['longBreakMins', 5, 45],
    ['roundsBeforeLong', 2, 8],
    ['totalRounds', 1, 12],
  ])('keeps %s between %i and %i', (field, min, max) => {
    expect(createRoomSchema.safeParse(withTimer(field, min)).success).toBe(true);
    expect(createRoomSchema.safeParse(withTimer(field, max)).success).toBe(true);
    expect(createRoomSchema.safeParse(withTimer(field, min - 1)).success).toBe(false);
    expect(createRoomSchema.safeParse(withTimer(field, max + 1)).success).toBe(false);
  });

  it('rejects focus rounds of 4 and 95 minutes with a clear message', () => {
    for (const focusMins of [4, 95]) {
      const result = createRoomSchema.safeParse(withTimer('focusMins', focusMins));
      expect(result.error?.issues[0]?.message).toBe('Focus must be between 5 and 90.');
    }
  });

  it('allows 10 goals but not 11', () => {
    const goals = (n: number) => Array.from({ length: n }, (_, i) => `Goal ${i + 1}`);
    expect(createRoomSchema.safeParse({ ...valid, goals: goals(10) }).success).toBe(true);
    expect(createRoomSchema.safeParse({ ...valid, goals: goals(11) }).success).toBe(false);
  });

  it('needs auto-start to be set', () => {
    const { autoStart: _, ...rest } = timerSettings;
    expect(createRoomSchema.safeParse({ ...valid, timerSettings: rest }).success).toBe(false);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['a name over 60 characters', { name: 'x'.repeat(61) }],
    ['a subject over 40 characters', { subject: 'x'.repeat(41) }],
    ['a description over 200 characters', { description: 'x'.repeat(201) }],
    ['a blank goal', { goals: ['  '] }],
    ['a goal over 120 characters', { goals: ['x'.repeat(121)] }],
    ['a missing visibility', { isPublic: undefined }],
    ['an unknown field', { hostId: '6650f0c2a1b2c3d4e5f60718' }],
    ['a timer state', { timer: { phase: 'focus' } }],
  ])('rejects %s', (_, change) => {
    expect(createRoomSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('publicRoomsQuerySchema', () => {
  it('defaults to the first page of all rooms', () => {
    expect(publicRoomsQuerySchema.parse({})).toEqual({ page: 1, filter: 'all' });
  });

  it('reads string query values', () => {
    expect(publicRoomsQuerySchema.parse({ page: '3', subject: ' Law ', q: ' exam', filter: 'open' })).toEqual(
      {
        page: 3,
        subject: 'Law',
        q: 'exam',
        filter: 'open',
      },
    );
  });

  it('treats blank text as no filter', () => {
    expect(publicRoomsQuerySchema.parse({ subject: ' ', q: '' })).toEqual({ page: 1, filter: 'all' });
  });

  it.each([{ page: '0' }, { page: 'two' }, { filter: 'full' }])('rejects %o', (query) => {
    expect(publicRoomsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('room params', () => {
  it('accepts a Mongo id and rejects anything else', () => {
    expect(roomIdParamsSchema.safeParse({ id: '6650f0c2a1b2c3d4e5f60718' }).success).toBe(true);
    expect(roomIdParamsSchema.safeParse({ id: 'room-1' }).success).toBe(false);
  });

  it('accepts a 10-character invite code only', () => {
    expect(inviteCodeParamsSchema.safeParse({ code: 'aB3_xK9-q2' }).success).toBe(true);
    expect(inviteCodeParamsSchema.safeParse({ code: 'aB3xK9' }).success).toBe(false);
    expect(inviteCodeParamsSchema.safeParse({ code: 'aB3xK9q2.!' }).success).toBe(false);
  });
});
