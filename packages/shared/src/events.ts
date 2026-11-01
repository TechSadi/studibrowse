// Socket.IO event names, payload schemas and types. Every event is listed in docs/SOCKET-EVENTS.md;
// change both together.
import { z } from 'zod';
import {
  CHAT_TEXT_MAX,
  INVITE_CODE_PATTERN,
  MEMBER_STATUSES,
  RESOURCE_TITLE_MAX,
  RESOURCE_URL_MAX,
  WORKING_ON_MAX,
} from './constants';
import { goalTextSchema, objectIdSchema, roomSettingsSchema } from './schemas/rooms';
import { fileNameSchema, fileSizeSchema } from './schemas/uploads';
import type { RoomDetail, RoomGoal, RoomTimer, TimerSettings } from './types/api';
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
const resourceId = objectIdSchema('That resource id is not valid.');

const roomOnlySchema = z.strictObject({ roomId });

/** A private room also needs its invite code, unless you're its host or already in it. */
export const roomJoinSchema = z.strictObject({
  roomId,
  inviteCode: z.string().regex(INVITE_CODE_PATTERN, 'That invite code is not valid.').optional(),
});
export const roomLeaveSchema = roomOnlySchema;

/** The host's Room settings dialog: the Create a room fields, for a room that already exists. */
export const roomSettingsUpdateSchema = roomSettingsSchema.extend({ roomId });

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

/** timer:start (which also resumes a paused timer), timer:pause, timer:skip and timer:reset. */
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

/**
 * Files are uploaded to storage first (signed over REST); this shares the returned url. The server checks
 * the stored file's real size and type rather than trusting `size`. Links never carry a size or name.
 */
export const resourceAddSchema = z.discriminatedUnion('type', [
  z.strictObject({ roomId, type: z.literal('link'), title: resourceTitle, url: resourceUrl }),
  z.strictObject({
    roomId,
    type: z.literal('file'),
    title: resourceTitle,
    url: resourceUrl,
    size: fileSizeSchema,
    fileName: fileNameSchema,
  }),
]);

export const resourceRemoveSchema = z.strictObject({ roomId, resourceId });

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
  /** The server's clock (epoch ms) when it answered, so the client can correct its own clock for the timer. */
  serverNow: number;
}

/** The room's timer after a host command or a phase change. `serverNow` is the server's clock in epoch ms. */
export interface TimerStatePayload {
  roomId: string;
  timer: RoomTimer;
  serverNow: number;
}

/** Room settings everyone in the room shares, sent after the host saves them. */
export interface RoomSettingsUpdate {
  name: string;
  subject: string;
  description: string;
  isPublic: boolean;
  maxSize: number;
  timerSettings: TimerSettings;
}

export interface ClientToServerEvents {
  'room:join': WithAck<typeof roomJoinSchema, RoomJoinData>;
  'room:leave': WithAck<typeof roomLeaveSchema, EmptyData>;
  'room:settings': WithAck<typeof roomSettingsUpdateSchema, EmptyData>;
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
  'resource:remove': WithAck<typeof resourceRemoveSchema, EmptyData>;
  'host:transfer': WithAck<typeof hostTransferSchema, EmptyData>;
  'member:remove': WithAck<typeof memberRemoveSchema, EmptyData>;
}

export interface ServerToClientEvents {
  'room:update': (payload: { roomId: string; settings: RoomSettingsUpdate }) => void;
  /** To the removed person's own sockets (`user:<id>`). */
  'room:removed': (payload: { roomId: string }) => void;
  'presence:update': (payload: { roomId: string; members: PresenceMember[] }) => void;
  'chat:new': (payload: { message: ChatMessage }) => void;
  'chat:typing': (payload: { roomId: string; userId: string; isTyping: boolean }) => void;
  'timer:state': (payload: TimerStatePayload) => void;
  'goal:update': (payload: { roomId: string; goals: RoomGoal[] }) => void;
  'resource:new': (payload: { resource: RoomResource }) => void;
  'resource:removed': (payload: { roomId: string; resourceId: string }) => void;
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
  'room:settings': roomSettingsUpdateSchema,
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
  'resource:remove': resourceRemoveSchema,
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
