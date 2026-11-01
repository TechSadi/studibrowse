import { describe, expect, it } from 'vitest';
import { createKeyedLock } from './keyedLock';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createKeyedLock', () => {
  it('runs tasks with the same key one after another, in order', async () => {
    const lock = createKeyedLock();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name} start`);
      await pause(ms);
      log.push(`${name} end`);
      return name;
    };
    const results = await Promise.all([lock('room', task('a', 20)), lock('room', task('b', 1))]);
    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('lets different keys run at the same time', async () => {
    const lock = createKeyedLock();
    const log: string[] = [];
    await Promise.all([
      lock('one', async () => {
        log.push('one start');
        await pause(20);
        log.push('one end');
      }),
      lock('two', async () => {
        log.push('two');
      }),
    ]);
    expect(log).toEqual(['one start', 'two', 'one end']);
  });

  it('keeps going after a task fails', async () => {
    const lock = createKeyedLock();
    const failed = lock('room', () => Promise.reject(new Error('boom')));
    const next = lock('room', () => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
