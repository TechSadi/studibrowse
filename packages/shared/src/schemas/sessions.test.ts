import { describe, expect, it } from 'vitest';
import { SESSION_HISTORY_PAGE_SIZE } from '../constants';
import { latestSessionQuerySchema, mySessionsQuerySchema } from './sessions';

const roomId = '65f1c0ffee0000000000abcd';

describe('latestSessionQuerySchema', () => {
  it('takes a room id and an optional time from the query string', () => {
    expect(latestSessionQuerySchema.parse({ roomId })).toEqual({ roomId });
    expect(latestSessionQuerySchema.parse({ roomId, since: '1793577600000' })).toEqual({
      roomId,
      since: 1793577600000,
    });
  });

  it.each([
    ['a bad room id', { roomId: 'nope' }],
    ['no room id', {}],
    ['a time that isn’t a number', { roomId, since: 'soon' }],
    ['a negative time', { roomId, since: '-1' }],
  ])('rejects %s', (_, query) => {
    expect(latestSessionQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('mySessionsQuerySchema', () => {
  it('defaults to a full first page', () => {
    expect(mySessionsQuerySchema.parse({})).toEqual({ limit: SESSION_HISTORY_PAGE_SIZE });
  });

  it('takes a cursor and a smaller page from the query string', () => {
    expect(mySessionsQuerySchema.parse({ cursor: 'abc', limit: '3' })).toEqual({ cursor: 'abc', limit: 3 });
  });

  it.each([
    ['an empty cursor', { cursor: '' }],
    ['a page of 0', { limit: '0' }],
    ['a page bigger than the most', { limit: String(SESSION_HISTORY_PAGE_SIZE + 1) }],
    ['a page that isn’t a whole number', { limit: '2.5' }],
  ])('rejects %s', (_, query) => {
    expect(mySessionsQuerySchema.safeParse(query).success).toBe(false);
  });
});
