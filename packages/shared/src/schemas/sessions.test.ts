import { describe, expect, it } from 'vitest';
import { latestSessionQuerySchema } from './sessions';

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
