import { describe, expect, it } from 'vitest';
import { parseInviteInput } from './invite';

describe('parseInviteInput', () => {
  it('reads the code from a full invite link', () => {
    expect(parseInviteInput('https://studibrowse.app/r/aB3xK9_q-2')).toBe('aB3xK9_q-2');
    expect(parseInviteInput('  http://localhost:5173/r/aB3xK9_q-2/?ref=chat ')).toBe('aB3xK9_q-2');
  });

  it('reads the code from a path or a bare code', () => {
    expect(parseInviteInput('/r/aB3xK9_q-2')).toBe('aB3xK9_q-2');
    expect(parseInviteInput('aB3xK9_q-2')).toBe('aB3xK9_q-2');
  });

  it('rejects empty input, other links and text with spaces', () => {
    expect(parseInviteInput('   ')).toBeNull();
    expect(parseInviteInput('https://example.com/rooms')).toBeNull();
    expect(parseInviteInput('join my room')).toBeNull();
    expect(parseInviteInput('ab')).toBeNull();
    // Invite codes are exactly 10 characters.
    expect(parseInviteInput('aB3xK9')).toBeNull();
    expect(parseInviteInput('https://studibrowse.app/r/aB3xK9q2xyz')).toBeNull();
  });
});
