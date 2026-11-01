import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  currentTheme,
  getThemePref,
  setThemePref,
  watchSystemTheme,
  type Theme,
  type ThemePref,
} from '../lib/theme';

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    if (pref !== 'system') return;
    return watchSystemTheme(() => setTheme(applyTheme('system')));
  }, [pref]);

  // Several components read the theme (toggle buttons, the Google button); stay in sync with <html>.
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const choose = useCallback((next: ThemePref) => {
    setPref(next);
    setTheme(setThemePref(next));
  }, []);

  const toggle = useCallback(() => {
    choose(theme === 'dark' ? 'light' : 'dark');
  }, [choose, theme]);

  return { pref, theme, choose, toggle };
}
