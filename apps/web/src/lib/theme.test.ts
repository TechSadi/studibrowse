import { afterEach, describe, expect, it } from 'vitest';
import { getThemePref, resolveTheme, setThemePref, THEME_STORAGE_KEY } from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('resolveTheme', () => {
  it('follows the device when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  it('uses an explicit preference regardless of the device', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});

describe('theme preference storage', () => {
  it('defaults to system when nothing or garbage is stored', () => {
    expect(getThemePref()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(getThemePref()).toBe('system');
  });

  it('saves the preference and applies it to <html>', () => {
    setThemePref('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(getThemePref()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
