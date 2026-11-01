export type KeyedLock = <T>(key: string, task: () => Promise<T>) => Promise<T>;

/**
 * Runs tasks with the same key one at a time, in the order they arrive; different keys run freely. A task that
 * fails doesn't block the ones queued behind it. In memory, so it only serialises within one process.
 */
export function createKeyedLock(): KeyedLock {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
