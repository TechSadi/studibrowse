import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CHAT_TEXT_MAX,
  FILE_NAME_MAX,
  GOAL_TEXT_MAX,
  MAX_FILE_MB,
  RESOURCE_URL_MAX,
  WORKING_ON_MAX,
} from './constants';
import {
  chatSendSchema,
  chatTypingSchema,
  clientEventSchemas,
  goalAddSchema,
  goalRemoveSchema,
  goalToggleSchema,
  hostTransferSchema,
  lobbySubscribeSchema,
  lobbyUnsubscribeSchema,
  resourceAddSchema,
  resourceRemoveSchema,
  roomJoinSchema,
  roomSettingsUpdateSchema,
  statusSetSchema,
  type AckData,
  type AckEventName,
  type SignalEventName,
} from './events';

const roomId = '64b7f0c2a1b2c3d4e5f60718';
const userId = '64b7f0c2a1b2c3d4e5f60719';

describe('clientEventSchemas', () => {
  it('has a schema for every client event in docs/SOCKET-EVENTS.md', () => {
    expect(Object.keys(clientEventSchemas).sort()).toEqual(
      [
        'chat:send',
        'chat:typing',
        'goal:add',
        'goal:remove',
        'goal:toggle',
        'host:transfer',
        'lobby:subscribe',
        'lobby:unsubscribe',
        'member:remove',
        'resource:add',
        'resource:remove',
        'room:join',
        'room:leave',
        'room:settings',
        'status:set',
        'timer:pause',
        'timer:reset',
        'timer:skip',
        'timer:start',
      ].sort(),
    );
  });

  it('treats only chat:typing as fire-and-forget', () => {
    expectTypeOf<SignalEventName>().toEqualTypeOf<'chat:typing'>();
    expectTypeOf<'chat:send'>().toExtend<AckEventName>();
    expectTypeOf<AckData<'chat:send'>>().toHaveProperty('message');
  });
});

describe.each([
  ['lobby:subscribe', lobbySubscribeSchema],
  ['lobby:unsubscribe', lobbyUnsubscribeSchema],
])('%s', (_event, schema) => {
  it('takes an empty payload', () => {
    expect(schema.parse({})).toEqual({});
  });

  it('rejects unknown fields and non-objects', () => {
    expect(schema.safeParse({ roomId }).success).toBe(false);
    expect(schema.safeParse(undefined).success).toBe(false);
  });
});

describe('room id payloads', () => {
  it('accepts an ObjectId', () => {
    expect(roomJoinSchema.parse({ roomId })).toEqual({ roomId });
  });

  it('rejects bad ids and unknown fields', () => {
    expect(roomJoinSchema.safeParse({ roomId: 'nope' }).success).toBe(false);
    expect(roomJoinSchema.safeParse({}).success).toBe(false);
    expect(roomJoinSchema.safeParse({ roomId, hostId: userId }).success).toBe(false);
  });

  it('takes an optional invite code on room:join', () => {
    expect(roomJoinSchema.parse({ roomId, inviteCode: 'abcDEF12_-' })).toEqual({
      roomId,
      inviteCode: 'abcDEF12_-',
    });
    expect(roomJoinSchema.safeParse({ roomId, inviteCode: 'short' }).success).toBe(false);
  });

  it('checks user ids too', () => {
    expect(hostTransferSchema.safeParse({ roomId, userId }).success).toBe(true);
    expect(hostTransferSchema.safeParse({ roomId, userId: '123' }).success).toBe(false);
  });
});

describe('chatSendSchema', () => {
  it('trims the text', () => {
    expect(chatSendSchema.parse({ roomId, text: '  hi  ' }).text).toBe('hi');
  });

  it('rejects empty and over-long messages', () => {
    expect(chatSendSchema.safeParse({ roomId, text: '   ' }).success).toBe(false);
    expect(chatSendSchema.safeParse({ roomId, text: 'a'.repeat(CHAT_TEXT_MAX) }).success).toBe(true);
    expect(chatSendSchema.safeParse({ roomId, text: 'a'.repeat(CHAT_TEXT_MAX + 1) }).success).toBe(false);
  });

  it('checks the length after trimming', () => {
    const padded = `  ${'a'.repeat(CHAT_TEXT_MAX)}  `;
    expect(chatSendSchema.parse({ roomId, text: padded }).text).toHaveLength(CHAT_TEXT_MAX);
  });

  it('rejects unknown keys', () => {
    expect(chatSendSchema.safeParse({ roomId, text: 'hi', userId: roomId }).success).toBe(false);
  });
});

describe('chatTypingSchema', () => {
  it('needs a boolean', () => {
    expect(chatTypingSchema.safeParse({ roomId, isTyping: true }).success).toBe(true);
    expect(chatTypingSchema.safeParse({ roomId, isTyping: 'yes' }).success).toBe(false);
  });
});

describe('statusSetSchema', () => {
  it('accepts a status, a note or both', () => {
    expect(statusSetSchema.safeParse({ roomId, status: 'break' }).success).toBe(true);
    expect(statusSetSchema.safeParse({ roomId, workingOn: ' Chapter 4 ' }).data?.workingOn).toBe('Chapter 4');
    // An empty note clears it.
    expect(statusSetSchema.safeParse({ roomId, workingOn: '' }).success).toBe(true);
  });

  it('rejects an empty update, unknown statuses and long notes', () => {
    expect(statusSetSchema.safeParse({ roomId }).success).toBe(false);
    expect(statusSetSchema.safeParse({ roomId, status: 'asleep' }).success).toBe(false);
    expect(statusSetSchema.safeParse({ roomId, workingOn: 'a'.repeat(WORKING_ON_MAX + 1) }).success).toBe(
      false,
    );
  });
});

describe('goalAddSchema', () => {
  it('uses the room goal rules', () => {
    expect(goalAddSchema.safeParse({ roomId, text: 'Finish set 3' }).success).toBe(true);
    expect(goalAddSchema.safeParse({ roomId, text: ' ' }).success).toBe(false);
  });

  it('trims the text and allows up to 120 characters', () => {
    expect(GOAL_TEXT_MAX).toBe(120);
    expect(goalAddSchema.parse({ roomId, text: '  Finish set 3 ' })).toEqual({
      roomId,
      text: 'Finish set 3',
    });
    expect(goalAddSchema.safeParse({ roomId, text: 'x'.repeat(GOAL_TEXT_MAX) }).success).toBe(true);
    expect(goalAddSchema.safeParse({ roomId, text: 'x'.repeat(GOAL_TEXT_MAX + 1) }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(goalAddSchema.safeParse({ roomId, text: 'Finish set 3', done: true }).success).toBe(false);
  });
});

describe.each([
  ['goalToggleSchema', goalToggleSchema],
  ['goalRemoveSchema', goalRemoveSchema],
])('%s', (_, schema) => {
  const goalId = '64b7f0c2a1b2c3d4e5f60720';

  it('takes a room id and a goal id', () => {
    expect(schema.safeParse({ roomId, goalId }).success).toBe(true);
  });

  it('rejects a bad goal id or unknown fields', () => {
    expect(schema.safeParse({ roomId, goalId: 'goal-1' }).success).toBe(false);
    expect(schema.safeParse({ roomId }).success).toBe(false);
    expect(schema.safeParse({ roomId, goalId, done: true }).success).toBe(false);
  });
});

describe('resourceAddSchema', () => {
  const link = { roomId, type: 'link', title: 'Notes', url: 'https://example.com/notes' };
  const file = { ...link, type: 'file', size: 1024, fileName: 'notes.pdf' };

  it('accepts links without a size and files with a size and name', () => {
    expect(resourceAddSchema.safeParse(link).success).toBe(true);
    expect(resourceAddSchema.safeParse(file).success).toBe(true);
  });

  it('rejects sizes or names on links, missing or too-large sizes on files', () => {
    expect(resourceAddSchema.safeParse({ ...link, size: 10 }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...link, fileName: 'notes.pdf' }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...link, type: 'file', fileName: 'notes.pdf' }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...file, size: MAX_FILE_MB * 1024 * 1024 + 1 }).success).toBe(false);
  });

  it('requires a file name of a sane length on files', () => {
    expect(resourceAddSchema.safeParse({ ...file, fileName: undefined }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...file, fileName: '   ' }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...file, fileName: 'a'.repeat(FILE_NAME_MAX + 1) }).success).toBe(
      false,
    );
  });

  it('only accepts http(s) urls of a sane length', () => {
    expect(resourceAddSchema.safeParse({ ...link, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...link, url: 'not a url' }).success).toBe(false);
    const long = `https://example.com/${'a'.repeat(RESOURCE_URL_MAX)}`;
    expect(resourceAddSchema.safeParse({ ...link, url: long }).success).toBe(false);
  });
});

describe('resourceRemoveSchema', () => {
  const resourceId = '64b7f0c2a1b2c3d4e5f6071a';

  it('takes a room id and a resource id', () => {
    expect(resourceRemoveSchema.safeParse({ roomId, resourceId }).success).toBe(true);
  });

  it('rejects a bad resource id or unknown fields', () => {
    expect(resourceRemoveSchema.safeParse({ roomId, resourceId: 'r1' }).success).toBe(false);
    expect(resourceRemoveSchema.safeParse({ roomId, resourceId, url: 'https://x.y' }).success).toBe(false);
  });
});

describe('room:settings', () => {
  const settings = {
    roomId,
    name: '  Finals week focus ',
    isPublic: true,
    maxSize: 12,
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: true,
    },
  };

  it('takes the Create a room fields plus the room id', () => {
    const parsed = roomSettingsUpdateSchema.parse(settings);
    expect(parsed).toMatchObject({ roomId, name: 'Finals week focus', subject: '', goals: [] });
  });

  it('rejects fields the host may not set', () => {
    expect(roomSettingsUpdateSchema.safeParse({ ...settings, hostId: userId }).success).toBe(false);
    expect(roomSettingsUpdateSchema.safeParse({ ...settings, roomId: 'nope' }).success).toBe(false);
  });
});
