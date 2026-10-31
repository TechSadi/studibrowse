// Keep the storage key and resolution rules in sync with the pre-paint script in index.html.
export const THEME_STORAGE_KEY = 'sb-theme';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePref(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref, systemPrefersLight: boolean): Theme {
  if (pref !== 'system') return pref;
  return systemPrefersLight ? 'light' : 'dark';
}

function systemPrefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;
}

/** The theme currently on <html> (set before first paint by index.html). */
export function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  if (applied === 'light' || applied === 'dark') return applied;
  return resolveTheme(getThemePref(), systemPrefersLight());
}

export function applyTheme(pref: ThemePref): Theme {
  const theme = resolveTheme(pref, systemPrefersLight());
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function setThemePref(pref: ThemePref): Theme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this page view.
  }
  return applyTheme(pref);
}

/** Calls `onChange` when the device theme changes. Returns an unsubscribe function. */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
