import { describe, expect, it } from 'vitest';
import { parseInviteInput } from './invite';

describe('parseInviteInput', () => {
  it('reads the code from a full invite link', () => {
    expect(parseInviteInput('https://studibrowse.app/r/aB3xK9')).toBe('aB3xK9');
    expect(parseInviteInput('  http://localhost:5173/r/aB3xK9/?ref=chat ')).toBe('aB3xK9');
  });

  it('reads the code from a path or a bare code', () => {
    expect(parseInviteInput('/r/aB3xK9')).toBe('aB3xK9');
    expect(parseInviteInput('aB3xK9')).toBe('aB3xK9');
  });

  it('rejects empty input, other links and text with spaces', () => {
    expect(parseInviteInput('   ')).toBeNull();
    expect(parseInviteInput('https://example.com/rooms')).toBeNull();
    expect(parseInviteInput('join my room')).toBeNull();
    expect(parseInviteInput('ab')).toBeNull();
  });
});
