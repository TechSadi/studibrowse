import { describe, expect, it } from 'vitest';
import { NOTIFICATIONS_PAGE_SIZE } from '../constants';
import { markReadSchema, notificationsQuerySchema } from './notifications';

describe('notificationsQuerySchema', () => {
  it('defaults to a full first page of everything', () => {
    expect(notificationsQuerySchema.parse({})).toEqual({ filter: 'all', limit: NOTIFICATIONS_PAGE_SIZE });
  });

  it('takes a filter, a cursor and a smaller page from the query string', () => {
    expect(notificationsQuerySchema.parse({ filter: 'rooms', cursor: 'abc', limit: '5' })).toEqual({
      filter: 'rooms',
      cursor: 'abc',
      limit: 5,
    });
  });

  it.each([
    ['an unknown filter', { filter: 'muted' }],
    ['an empty cursor', { cursor: '' }],
    ['a page of 0', { limit: '0' }],
    ['a page bigger than the most', { limit: String(NOTIFICATIONS_PAGE_SIZE + 1) }],
  ])('rejects %s', (_, query) => {
    expect(notificationsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('markReadSchema', () => {
  it('takes one id or all', () => {
    expect(markReadSchema.parse({ id: '65f1c0ffee0000000000abcd' })).toEqual({
      id: '65f1c0ffee0000000000abcd',
    });
    expect(markReadSchema.parse({ all: true })).toEqual({ all: true });
  });

  it.each([
    ['nothing', {}],
    ['a bad id', { id: 'nope' }],
    ['all: false', { all: false }],
    ['both', { id: '65f1c0ffee0000000000abcd', all: true }],
  ])('rejects %s', (_, body) => {
    expect(markReadSchema.safeParse(body).success).toBe(false);
  });
});
