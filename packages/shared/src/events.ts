// Socket.IO event names, payload schemas and types. Every event is listed in docs/SOCKET-EVENTS.md;
// change both together.
import { z } from 'zod';
import {
  CHAT_TEXT_MAX,
  INVITE_CODE_PATTERN,
  MAX_FILE_MB,
  MEMBER_STATUSES,
  RESOURCE_TITLE_MAX,
  RESOURCE_URL_MAX,
  WORKING_ON_MAX,
} from './constants';
import { goalTextSchema, objectIdSchema } from './schemas/rooms';
import type { RoomDetail, RoomGoal, RoomTimer } from './types/api';
import type {
  AppNotification,
  ChatMessage,
  PresenceMember,
  RoomResource,
  SessionSummary,
} from './types/realtime';

/** Error codes a socket ack or connect error can carry, on top of each feature's own codes. */
export const SOCKET_ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  rateLimited: 'RATE_LIMITED',
  internal: 'INTERNAL_ERROR',
  unauthenticated: 'UNAUTHENTICATED',
  tokenExpired: 'TOKEN_EXPIRED',
} as const;

export interface SocketError {
  code: string;
  message: string;
}

/** What every acknowledged client → server event answers with. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: SocketError };
export type AckCallback<T> = (response: Ack<T>) => void;

/** Ack data for events that only confirm they worked. */
export type EmptyData = Record<string, never>;

// ---- Client → server payload schemas ----

const roomId = objectIdSchema('That room id is not valid.');
const userId = objectIdSchema('That user id is not valid.');
const goalId = objectIdSchema('That goal id is not valid.');

const roomOnlySchema = z.strictObject({ roomId });

/** A private room also needs its invite code, unless you're its host or already in it. */
export const roomJoinSchema = z.strictObject({
  roomId,
  inviteCode: z.string().regex(INVITE_CODE_PATTERN, 'That invite code is not valid.').optional(),
});
export const roomLeaveSchema = roomOnlySchema;

export const statusSetSchema = z
  .strictObject({
    roomId,
    status: z.enum(MEMBER_STATUSES, 'That status is not valid.').optional(),
    workingOn: z.string().trim().max(WORKING_ON_MAX, `Keep it to ${WORKING_ON_MAX} characters.`).optional(),
  })
  .refine((value) => value.status !== undefined || value.workingOn !== undefined, {
    message: 'Send a status or a working-on note.',
  });

export const chatSendSchema = z.strictObject({
  roomId,
  text: z
    .string()
    .trim()
    .min(1, 'Messages can’t be empty.')
    .max(CHAT_TEXT_MAX, `Keep messages to ${CHAT_TEXT_MAX} characters.`),
});

export const chatTypingSchema = z.strictObject({ roomId, isTyping: z.boolean() });

/** timer:start, timer:pause, timer:skip and timer:reset. */
export const timerCommandSchema = roomOnlySchema;

export const goalAddSchema = z.strictObject({ roomId, text: goalTextSchema });
export const goalToggleSchema = z.strictObject({ roomId, goalId });
export const goalRemoveSchema = goalToggleSchema;

const resourceTitle = z
  .string()
  .trim()
  .min(1, 'Give it a title.')
  .max(RESOURCE_TITLE_MAX, `Keep the title to ${RESOURCE_TITLE_MAX} characters.`);

const resourceUrl = z
  .string()
  .trim()
  .max(RESOURCE_URL_MAX, 'That link is too long.')
  .pipe(z.url({ protocol: /^https?$/, error: 'That link is not valid.' }));

/** Files are uploaded over REST first; this shares the returned url. Links never carry a size. */
export const resourceAddSchema = z.discriminatedUnion('type', [
  z.strictObject({ roomId, type: z.literal('link'), title: resourceTitle, url: resourceUrl }),
  z.strictObject({
    roomId,
    type: z.literal('file'),
    title: resourceTitle,
    url: resourceUrl,
    size: z
      .number()
      .int()
      .positive()
      .max(MAX_FILE_MB * 1024 * 1024, `Files can be up to ${MAX_FILE_MB} MB.`),
  }),
]);

export const hostTransferSchema = z.strictObject({ roomId, userId });
export const memberRemoveSchema = hostTransferSchema;

// ---- Event maps ----

type WithAck<Schema extends z.ZodType, Data> = (payload: z.input<Schema>, ack: AckCallback<Data>) => void;

export interface RoomJoinData {
  /** Includes the timer and goals. */
  room: RoomDetail;
  members: PresenceMember[];
  resources: RoomResource[];
  /** The last 50, oldest first. */
  messages: ChatMessage[];
}

export interface ClientToServerEvents {
  'room:join': WithAck<typeof roomJoinSchema, RoomJoinData>;
  'room:leave': WithAck<typeof roomLeaveSchema, EmptyData>;
  'status:set': WithAck<typeof statusSetSchema, EmptyData>;
  'chat:send': WithAck<typeof chatSendSchema, { message: ChatMessage }>;
  /** No ack: typing indicators are best effort. */
  'chat:typing': (payload: z.input<typeof chatTypingSchema>) => void;
  'timer:start': WithAck<typeof timerCommandSchema, EmptyData>;
  'timer:pause': WithAck<typeof timerCommandSchema, EmptyData>;
  'timer:skip': WithAck<typeof timerCommandSchema, EmptyData>;
  'timer:reset': WithAck<typeof timerCommandSchema, EmptyData>;
  'goal:add': WithAck<typeof goalAddSchema, EmptyData>;
  'goal:toggle': WithAck<typeof goalToggleSchema, EmptyData>;
  'goal:remove': WithAck<typeof goalRemoveSchema, EmptyData>;
  'resource:add': WithAck<typeof resourceAddSchema, { resource: RoomResource }>;
  'host:transfer': WithAck<typeof hostTransferSchema, EmptyData>;
  'member:remove': WithAck<typeof memberRemoveSchema, EmptyData>;
}

export interface ServerToClientEvents {
  'presence:update': (payload: { roomId: string; members: PresenceMember[] }) => void;
  'chat:new': (payload: { message: ChatMessage }) => void;
  'chat:typing': (payload: { roomId: string; userId: string; isTyping: boolean }) => void;
  'timer:state': (payload: { roomId: string; timer: RoomTimer }) => void;
  'goal:update': (payload: { roomId: string; goals: RoomGoal[] }) => void;
  'resource:new': (payload: { resource: RoomResource }) => void;
  'session:logged': (payload: {
    roomId: string;
    session: SessionSummary;
    totalSessions: number;
    totalFocusMins: number;
  }) => void;
  'notification:new': (payload: { notification: AppNotification }) => void;
}

/** What the server stores on each socket after the handshake. */
export interface SocketData {
  userId: string;
}

/** The schema for every client → server event. The server validates each payload against it. */
export const clientEventSchemas = {
  'room:join': roomJoinSchema,
  'room:leave': roomLeaveSchema,
  'status:set': statusSetSchema,
  'chat:send': chatSendSchema,
  'chat:typing': chatTypingSchema,
  'timer:start': timerCommandSchema,
  'timer:pause': timerCommandSchema,
  'timer:skip': timerCommandSchema,
  'timer:reset': timerCommandSchema,
  'goal:add': goalAddSchema,
  'goal:toggle': goalToggleSchema,
  'goal:remove': goalRemoveSchema,
  'resource:add': resourceAddSchema,
  'host:transfer': hostTransferSchema,
  'member:remove': memberRemoveSchema,
} as const satisfies Record<keyof ClientToServerEvents, z.ZodType>;

export type ClientEventName = keyof ClientToServerEvents;

/** Client events that take an ack callback (all but chat:typing). */
export type AckEventName = {
  [E in ClientEventName]: Parameters<ClientToServerEvents[E]> extends [unknown, AckCallback<infer _T>]
    ? E
    : never;
}[ClientEventName];

/** Client events that are fire-and-forget. */
export type SignalEventName = Exclude<ClientEventName, AckEventName>;

/** What the client sends for an event. */
export type ClientPayload<E extends ClientEventName> = z.input<(typeof clientEventSchemas)[E]>;
/** The payload after validation (trimmed, normalised), as handlers receive it. */
export type ParsedPayload<E extends ClientEventName> = z.output<(typeof clientEventSchemas)[E]>;

/** The data an acknowledged event answers with when it works. */
export type AckData<E extends AckEventName> =
  Parameters<ClientToServerEvents[E]>[1] extends AckCallback<infer T> ? T : never;
