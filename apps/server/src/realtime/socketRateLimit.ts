import type { ClientEventName } from '@studibrowse/shared';

export interface SocketRateLimitOptions {
  limit: number;
  windowMs: number;
}

/** chat:send per socket. Over the limit, the ack is RATE_LIMITED. */
export const CHAT_RATE_LIMIT: SocketRateLimitOptions = { limit: 5, windowMs: 5000 };

/** chat:typing per socket. It has no ack, so extra events are dropped. */
export const TYPING_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 5000 };

/** Each of goal:add, goal:toggle and goal:remove per socket, so nobody floods the room with goal:update. */
export const GOAL_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 5000 };

/** Each of resource:add and resource:remove per socket. Sharing checks storage, so it's kept low. */
export const RESOURCE_RATE_LIMIT: SocketRateLimitOptions = { limit: 5, windowMs: 10_000 };

export interface SocketRateLimiter {
  /** Counts one event for the key. False when the key is over the limit (the event is not counted). */
  consume: (key: string) => boolean;
  forget: (key: string) => void;
}

/**
 * Sliding window, in memory (one server process in v1). express-rate-limit only works on HTTP requests, and
 * this is small enough not to need a library.
 */
export function createSocketRateLimiter(
  { limit, windowMs }: SocketRateLimitOptions,
  now: () => number = Date.now,
): SocketRateLimiter {
  const hitsByKey = new Map<string, number[]>();
  return {
    consume(key) {
      const time = now();
      const recent = (hitsByKey.get(key) ?? []).filter((at) => time - at < windowMs);
      const allowed = recent.length < limit;
      if (allowed) recent.push(time);
      hitsByKey.set(key, recent);
      return allowed;
    },
    forget(key) {
      hitsByKey.delete(key);
    },
  };
}

/**
 * The limit each event gets, keyed by socket id. The handler wrapper applies these, so a handler can't
 * forget its limit.
 */
export const eventRateLimiters: Partial<Record<ClientEventName, SocketRateLimiter>> = {
  'chat:send': createSocketRateLimiter(CHAT_RATE_LIMIT),
  'chat:typing': createSocketRateLimiter(TYPING_RATE_LIMIT),
  'goal:add': createSocketRateLimiter(GOAL_RATE_LIMIT),
  'goal:toggle': createSocketRateLimiter(GOAL_RATE_LIMIT),
  'goal:remove': createSocketRateLimiter(GOAL_RATE_LIMIT),
  'resource:add': createSocketRateLimiter(RESOURCE_RATE_LIMIT),
  'resource:remove': createSocketRateLimiter(RESOURCE_RATE_LIMIT),
};
