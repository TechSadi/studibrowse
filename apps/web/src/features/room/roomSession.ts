import type {
  ChatMessage,
  PresenceMember,
  RoomDetail,
  RoomGoal,
  RoomJoinData,
  RoomResource,
  RoomSettingsUpdate,
} from '@studibrowse/shared';
import { NETWORK_ERROR_CODE } from '../../lib/api';
import type { TimerSnapshot } from './useRoomTimer';

/** The room once you're in it. `snapshot` and `messages` are replaced on every (re)join, which resets the timer and chat. */
export interface JoinedRoom {
  room: RoomDetail;
  members: PresenceMember[];
  resources: RoomResource[];
  messages: ChatMessage[];
  snapshot: TimerSnapshot;
}

/** Screens shown instead of the room. */
export type EndedStatus = 'full' | 'closed' | 'notFound' | 'removed';

export type RoomSessionState =
  | { status: 'joining' }
  /** `rejoining`: the connection dropped; the room stays on screen while it reconnects. */
  | { status: 'joined' | 'rejoining'; joined: JoinedRoom }
  | { status: EndedStatus }
  | { status: 'error'; message: string };

export type RoomSessionAction =
  | { type: 'join' }
  | { type: 'joined'; data: RoomJoinData }
  | { type: 'joinFailed'; code: string; message: string }
  | { type: 'disconnected' }
  | { type: 'presence'; members: PresenceMember[] }
  | { type: 'settings'; settings: RoomSettingsUpdate }
  | { type: 'goals'; goals: RoomGoal[] }
  | { type: 'resourceAdded'; resource: RoomResource }
  | { type: 'resourceRemoved'; resourceId: string }
  | { type: 'removed' };

const ENDED_BY_CODE: Record<string, EndedStatus> = {
  ROOM_FULL: 'full',
  ROOM_CLOSED: 'closed',
  ROOM_NOT_FOUND: 'notFound',
};

export const initialRoomSession: RoomSessionState = { status: 'joining' };

const ENDED: ReadonlySet<RoomSessionState['status']> = new Set(['full', 'closed', 'notFound', 'removed']);

/** Nothing more to do in this room: don't rejoin on reconnect. */
export function isEnded(state: RoomSessionState): boolean {
  return ENDED.has(state.status);
}

function updateJoined(state: RoomSessionState, change: (joined: JoinedRoom) => JoinedRoom): RoomSessionState {
  if (state.status !== 'joined' && state.status !== 'rejoining') return state;
  return { status: state.status, joined: change(state.joined) };
}

export function roomSessionReducer(state: RoomSessionState, action: RoomSessionAction): RoomSessionState {
  switch (action.type) {
    case 'join':
      // While reconnecting, the room stays visible under the banner.
      return state.status === 'joined' || state.status === 'rejoining' ? state : { status: 'joining' };
    case 'joined': {
      const { room, members, resources, messages, serverNow } = action.data;
      return {
        status: 'joined',
        joined: { room, members, resources, messages, snapshot: { timer: room.timer, serverNow } },
      };
    }
    case 'joinFailed': {
      if (state.status === 'removed') return state;
      const ended = ENDED_BY_CODE[action.code];
      if (ended) return { status: ended };
      // A network failure while reconnecting keeps the room on screen; the next `connect` tries again.
      if (state.status === 'rejoining' && action.code === NETWORK_ERROR_CODE) return state;
      return { status: 'error', message: action.message };
    }
    case 'disconnected':
      return state.status === 'joined' ? { status: 'rejoining', joined: state.joined } : state;
    case 'presence':
      return updateJoined(state, (joined) => ({
        ...joined,
        members: action.members,
        room: { ...joined.room, memberCount: action.members.length },
      }));
    case 'settings': {
      // Only the shared settings: the payload never carries per-person fields like isHost.
      const { name, subject, description, isPublic, maxSize, timerSettings } = action.settings;
      return updateJoined(state, (joined) => ({
        ...joined,
        room: { ...joined.room, name, subject, description, isPublic, maxSize, timerSettings },
      }));
    }
    case 'goals':
      return updateJoined(state, (joined) => ({ ...joined, room: { ...joined.room, goals: action.goals } }));
    case 'resourceAdded':
      return updateJoined(state, (joined) =>
        // A rejoin's snapshot may already have it.
        joined.resources.some((resource) => resource.id === action.resource.id)
          ? joined
          : { ...joined, resources: [...joined.resources, action.resource] },
      );
    case 'resourceRemoved':
      return updateJoined(state, (joined) => ({
        ...joined,
        resources: joined.resources.filter((resource) => resource.id !== action.resourceId),
      }));
    case 'removed':
      return { status: 'removed' };
  }
}
