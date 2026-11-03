import type { ClientEventName } from '@studibrowse/shared';

export interface SocketRateLimitOptions {
  limit: number;
  windowMs: number;
}

/** chat:send per person. Over the limit, the ack is RATE_LIMITED. */
export const CHAT_RATE_LIMIT: SocketRateLimitOptions = { limit: 5, windowMs: 5000 };

/** chat:typing per person. It has no ack, so extra events are dropped. */
export const TYPING_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 5000 };

/** Each of goal:add, goal:toggle and goal:remove per person, so nobody floods the room with goal:update. */
export const GOAL_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 5000 };

/** Each of resource:add and resource:remove per person. Sharing checks storage, so it's kept low. */
export const RESOURCE_RATE_LIMIT: SocketRateLimitOptions = { limit: 5, windowMs: 10_000 };

/** Each of room:join and room:leave per person. Every join reads the database and tells the room and the lobby. */
export const ROOM_MEMBERSHIP_RATE_LIMIT: SocketRateLimitOptions = { limit: 20, windowMs: 10_000 };

/** status:set per person. Each one is a presence:update to the whole room. */
export const STATUS_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 5000 };

/** The four timer commands together, per person (host only anyway). */
export const TIMER_RATE_LIMIT: SocketRateLimitOptions = { limit: 20, windowMs: 10_000 };

/** Each of room:settings, room:close, host:transfer and member:remove per person (host only anyway). */
export const HOST_ACTION_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 10_000 };

/** follows:watch per person. Each one reads who they follow and where each of them is. */
export const FOLLOWS_WATCH_RATE_LIMIT: SocketRateLimitOptions = { limit: 10, windowMs: 10_000 };

/** lobby:subscribe and lobby:unsubscribe together, per person. */
export const LOBBY_RATE_LIMIT: SocketRateLimitOptions = { limit: 20, windowMs: 10_000 };

/** Sockets one person may have open at once. Plenty for tabs and devices; stops one account opening thousands. */
export const MAX_SOCKETS_PER_USER = 20;

/** The biggest event payload accepted. The largest valid one (room:settings) is well under 4 KB. */
export const MAX_SOCKET_PAYLOAD_BYTES = 32 * 1024;

export interface SocketRateLimiter {
  /** Counts one event for the key. False when the key is over the limit (the event is not counted). */
  consume: (key: string) => boolean;
  /** How many keys are tracked, for tests. */
  size: () => number;
}

/**
 * Sliding window, in memory (one server process in v1). express-rate-limit only works on HTTP requests, and
 * this is small enough not to need a library. Keys whose hits have all left the window are dropped now and
 * then, so the map doesn't grow with everyone who ever connected. Disconnecting never resets a budget.
 */
export function createSocketRateLimiter(
  { limit, windowMs }: SocketRateLimitOptions,
  now: () => number = Date.now,
): SocketRateLimiter {
  const hitsByKey = new Map<string, number[]>();
  let lastPrune = now();

  function pruneStale(time: number): void {
    if (time - lastPrune < windowMs) return;
    lastPrune = time;
    for (const [key, hits] of hitsByKey) {
      if (hits.every((at) => time - at >= windowMs)) hitsByKey.delete(key);
    }
  }

  return {
    consume(key) {
      const time = now();
      pruneStale(time);
      const recent = (hitsByKey.get(key) ?? []).filter((at) => time - at < windowMs);
      const allowed = recent.length < limit;
      if (allowed) recent.push(time);
      hitsByKey.set(key, recent);
      return allowed;
    },
    size: () => hitsByKey.size,
  };
}

const timerLimiter = createSocketRateLimiter(TIMER_RATE_LIMIT);
const lobbyLimiter = createSocketRateLimiter(LOBBY_RATE_LIMIT);

/**
 * The limit each event gets, keyed by user id, so more tabs or sockets don't buy a bigger budget. Events that
 * share a limiter share one budget. The handler wrapper applies these, so a handler can't forget its limit.
 */
export const eventRateLimiters: Record<ClientEventName, SocketRateLimiter> = {
  'room:join': createSocketRateLimiter(ROOM_MEMBERSHIP_RATE_LIMIT),
  'room:leave': createSocketRateLimiter(ROOM_MEMBERSHIP_RATE_LIMIT),
  'room:settings': createSocketRateLimiter(HOST_ACTION_RATE_LIMIT),
  'room:close': createSocketRateLimiter(HOST_ACTION_RATE_LIMIT),
  'status:set': createSocketRateLimiter(STATUS_RATE_LIMIT),
  'chat:send': createSocketRateLimiter(CHAT_RATE_LIMIT),
  'chat:typing': createSocketRateLimiter(TYPING_RATE_LIMIT),
  'timer:start': timerLimiter,
  'timer:pause': timerLimiter,
  'timer:skip': timerLimiter,
  'timer:reset': timerLimiter,
  'goal:add': createSocketRateLimiter(GOAL_RATE_LIMIT),
  'goal:toggle': createSocketRateLimiter(GOAL_RATE_LIMIT),
  'goal:remove': createSocketRateLimiter(GOAL_RATE_LIMIT),
  'resource:add': createSocketRateLimiter(RESOURCE_RATE_LIMIT),
  'resource:remove': createSocketRateLimiter(RESOURCE_RATE_LIMIT),
  'host:transfer': createSocketRateLimiter(HOST_ACTION_RATE_LIMIT),
  'member:remove': createSocketRateLimiter(HOST_ACTION_RATE_LIMIT),
  'lobby:subscribe': lobbyLimiter,
  'lobby:unsubscribe': lobbyLimiter,
  'follows:watch': createSocketRateLimiter(FOLLOWS_WATCH_RATE_LIMIT),
};
