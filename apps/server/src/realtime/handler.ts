import {
  clientEventSchemas,
  SOCKET_ERROR_CODES,
  type Ack,
  type AckData,
  type AckEventName,
  type ClientEventName,
  type ParsedPayload,
  type SignalEventName,
  type SocketError,
} from '@studibrowse/shared';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { validationMessage } from '../middleware/validate';
import { eventRateLimiters } from './socketRateLimit';
import type { TypedServer, TypedSocket } from './types';

export interface HandlerContext {
  io: TypedServer;
  socket: TypedSocket;
  userId: string;
}

type Handle<E extends ClientEventName, Result> = (
  payload: ParsedPayload<E>,
  context: HandlerContext,
) => Result | Promise<Result>;

const RATE_LIMITED: SocketError = {
  code: SOCKET_ERROR_CODES.rateLimited,
  message: 'You’re sending messages too fast. Wait a few seconds and try again.',
};

const INTERNAL_ERROR: SocketError = { code: SOCKET_ERROR_CODES.internal, message: 'Something went wrong.' };

/**
 * Rate limit, validate, run. Only AppError messages reach the client; anything else is logged and becomes a
 * generic INTERNAL_ERROR, the same rule as the REST error handler.
 */
async function run<E extends ClientEventName, Result>(
  io: TypedServer,
  socket: TypedSocket,
  event: E,
  payload: unknown,
  handle: Handle<E, Result>,
): Promise<Ack<Result>> {
  const userId = socket.data.userId;
  try {
    const limiter = eventRateLimiters[event];
    if (limiter && !limiter.consume(socket.id)) return { ok: false, error: RATE_LIMITED };

    const parsed = clientEventSchemas[event].safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: SOCKET_ERROR_CODES.validation, message: validationMessage(parsed.error) },
      };
    }
    const data = await handle(parsed.data as ParsedPayload<E>, { io, socket, userId });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } };
    logger.error({ err, event, userId }, 'unhandled socket handler error');
    return { ok: false, error: INTERNAL_ERROR };
  }
}

/** Registers a handler for an acknowledged event. Every outcome, success or error, is acked. */
export function onEvent<E extends AckEventName>(
  io: TypedServer,
  socket: TypedSocket,
  event: E,
  handle: Handle<E, AckData<E>>,
): void {
  // Payloads arrive untrusted, so the listener takes unknowns and the schema decides what they are.
  const listener = async (payload: unknown, ack: unknown) => {
    const outcome = await run(io, socket, event, payload, handle);
    // A client can leave the callback out; there is no one to answer then.
    if (typeof ack === 'function') (ack as (response: Ack<AckData<E>>) => void)(outcome);
  };
  socket.on(event as ClientEventName, listener as never);
}

/** Registers a handler for a fire-and-forget event (chat:typing). Rejected events are dropped. */
export function onSignal<E extends SignalEventName>(
  io: TypedServer,
  socket: TypedSocket,
  event: E,
  handle: Handle<E, void>,
): void {
  const listener = async (payload: unknown) => {
    await run(io, socket, event, payload, handle);
  };
  socket.on(event as ClientEventName, listener as never);
}
