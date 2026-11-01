import { describe, expect, it } from 'vitest';
import { avatarTone } from './avatar';

describe('avatarTone', () => {
  it('maps colours to tone slots in mockup order', () => {
    expect(avatarTone('green')).toBe(1);
    expect(avatarTone('red')).toBe(5);
    expect(avatarTone('olive')).toBe(6);
  });
});
