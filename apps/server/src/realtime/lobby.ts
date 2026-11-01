import { logger } from '../lib/logger';
import { loadRoomCard } from '../modules/rooms/rooms.service';
import { LOBBY_CHANNEL, type TypedServer } from './types';

/**
 * The lobby: everyone with a room list open (Home) gets each public room's card whenever it changes. In memory,
 * like presence. See docs/SOCKET-EVENTS.md › Lobby.
 */

/** At most one rooms:upsert per room in this window; changes inside it are folded into one trailing send. */
export const LOBBY_COALESCE_MS = 1000;

interface CoalesceWindow {
  timer: NodeJS.Timeout;
  /** Something changed since the window opened, so a send is due when it closes. */
  pending: boolean;
}

const windows = new Map<string, CoalesceWindow>();
// Sends still reading the database. removeRoomCard cancels them, so a card read before the room went private
// is never sent after its rooms:remove.
const inFlight = new Map<string, Set<{ cancelled: boolean }>>();

/** Reads the room now and tells the lobby: its card, rooms:remove if it closed, nothing if it's private. */
async function send(io: TypedServer, roomId: string): Promise<void> {
  const ticket = { cancelled: false };
  const tickets = inFlight.get(roomId) ?? new Set();
  tickets.add(ticket);
  inFlight.set(roomId, tickets);
  try {
    const state = await loadRoomCard(roomId);
    if (ticket.cancelled) return;
    if (state.kind === 'listed') io.to(LOBBY_CHANNEL).emit('rooms:upsert', { room: state.card });
    else if (state.kind === 'closed') removeRoomCard(io, roomId);
  } catch (err) {
    logger.error({ err, roomId }, 'failed to send a room card to the lobby');
  } finally {
    tickets.delete(ticket);
    if (tickets.size === 0 && inFlight.get(roomId) === tickets) inFlight.delete(roomId);
  }
}

function cancelInFlight(roomId: string): void {
  for (const ticket of inFlight.get(roomId) ?? []) ticket.cancelled = true;
  inFlight.delete(roomId);
}

/** Opens a window after a send. When it closes, a change made inside it is sent (and opens the next one). */
function openWindow(io: TypedServer, roomId: string): void {
  const timer = setTimeout(() => {
    const pending = windows.get(roomId)?.pending ?? false;
    windows.delete(roomId);
    if (pending) flushNow(io, roomId);
  }, LOBBY_COALESCE_MS);
  timer.unref();
  windows.set(roomId, { timer, pending: false });
}

function flushNow(io: TypedServer, roomId: string): void {
  openWindow(io, roomId);
  void send(io, roomId);
}

/**
 * Something on a room's card changed (created, someone joined or left, new host, settings, timer). Sends the
 * card straight away, or once the room's current window closes. Private rooms never reach the lobby.
 */
export function broadcastRoomCard(io: TypedServer, roomId: string): void {
  const current = windows.get(roomId);
  if (current) current.pending = true;
  else flushNow(io, roomId);
}

/** The room closed or went private: take its card down now, dropping any send still waiting. */
export function removeRoomCard(io: TypedServer, roomId: string): void {
  clearTimeout(windows.get(roomId)?.timer);
  windows.delete(roomId);
  cancelInFlight(roomId);
  io.to(LOBBY_CHANNEL).emit('rooms:remove', { roomId });
}

/** Drops every waiting send, for shutdown and tests. */
export function resetLobby(): void {
  for (const { timer } of windows.values()) clearTimeout(timer);
  windows.clear();
  for (const roomId of [...inFlight.keys()]) cancelInFlight(roomId);
}
