import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStep, loadStep, saveStep } from './onboardingProgress';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('onboarding progress', () => {
  it('starts at step 1', () => {
    expect(loadStep('user-1')).toBe(1);
  });

  it('remembers the step per user', () => {
    saveStep('user-1', 3);
    expect(loadStep('user-1')).toBe(3);
    expect(loadStep('user-2')).toBe(1);
  });

  it('clears the step', () => {
    saveStep('user-1', 2);
    clearStep('user-1');
    expect(loadStep('user-1')).toBe(1);
  });

  it.each(['0', '4', '2.5', 'two'])('ignores a stored %j', (value) => {
    localStorage.setItem('sb-onboarding:user-1', value);
    expect(loadStep('user-1')).toBe(1);
  });

  it('falls back to step 1 when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => saveStep('user-1', 2)).not.toThrow();
    expect(loadStep('user-1')).toBe(1);
  });
});
