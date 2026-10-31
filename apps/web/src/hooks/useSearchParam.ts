import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * One URL search param as state. Setting '' removes it. Updates replace the history entry,
 * so typing in a search box doesn't fill the back button.
 */
export function useSearchParam(key: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const setValue = useCallback(
    (value: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [params.get(key) ?? '', setValue];
}
