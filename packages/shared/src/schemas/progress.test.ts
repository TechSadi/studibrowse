import { describe, expect, it } from 'vitest';
import { progressSummaryQuerySchema } from './progress';

describe('progressSummaryQuerySchema', () => {
  it('defaults to this week', () => {
    expect(progressSummaryQuerySchema.parse({})).toEqual({ range: 'week' });
    expect(progressSummaryQuerySchema.parse({ range: 'week' })).toEqual({ range: 'week' });
  });

  it('rejects a range it doesn’t know', () => {
    expect(progressSummaryQuerySchema.safeParse({ range: 'year' }).success).toBe(false);
  });
});
