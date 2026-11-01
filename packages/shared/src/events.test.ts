import { describe, expect, expectTypeOf, it } from 'vitest';
import { CHAT_TEXT_MAX, MAX_FILE_MB, RESOURCE_URL_MAX, WORKING_ON_MAX } from './constants';
import {
  chatSendSchema,
  chatTypingSchema,
  clientEventSchemas,
  goalAddSchema,
  hostTransferSchema,
  resourceAddSchema,
  roomJoinSchema,
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
        'member:remove',
        'resource:add',
        'room:join',
        'room:leave',
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

describe('room id payloads', () => {
  it('accepts an ObjectId', () => {
    expect(roomJoinSchema.parse({ roomId })).toEqual({ roomId });
  });

  it('rejects bad ids and unknown fields', () => {
    expect(roomJoinSchema.safeParse({ roomId: 'nope' }).success).toBe(false);
    expect(roomJoinSchema.safeParse({}).success).toBe(false);
    expect(roomJoinSchema.safeParse({ roomId, hostId: userId }).success).toBe(false);
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
});

describe('resourceAddSchema', () => {
  const link = { roomId, type: 'link', title: 'Notes', url: 'https://example.com/notes' };

  it('accepts links without a size and files with one', () => {
    expect(resourceAddSchema.safeParse(link).success).toBe(true);
    expect(resourceAddSchema.safeParse({ ...link, type: 'file', size: 1024 }).success).toBe(true);
  });

  it('rejects sizes on links, missing or too-large sizes on files', () => {
    expect(resourceAddSchema.safeParse({ ...link, size: 10 }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...link, type: 'file' }).success).toBe(false);
    expect(
      resourceAddSchema.safeParse({ ...link, type: 'file', size: MAX_FILE_MB * 1024 * 1024 + 1 }).success,
    ).toBe(false);
  });

  it('only accepts http(s) urls of a sane length', () => {
    expect(resourceAddSchema.safeParse({ ...link, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(resourceAddSchema.safeParse({ ...link, url: 'not a url' }).success).toBe(false);
    const long = `https://example.com/${'a'.repeat(RESOURCE_URL_MAX)}`;
    expect(resourceAddSchema.safeParse({ ...link, url: long }).success).toBe(false);
  });
});
