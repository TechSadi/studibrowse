import { useCallback, useSyncExternalStore } from 'react';

const supported = () => typeof window.matchMedia === 'function';

/** Whether a CSS media query matches right now, e.g. `(max-width: 1100px)`. False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => supported() && window.matchMedia(query).matches);
}
