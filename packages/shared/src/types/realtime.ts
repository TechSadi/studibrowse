import type { AvatarColor, MemberStatus, NotificationType, ResourceType } from '../constants';

/** Someone connected to a room, as the People list and presence:update show them. */
export interface PresenceMember {
  userId: string;
  name: string;
  username: string;
  avatarColor: AvatarColor;
  status: MemberStatus;
  /** The member's "working on" note. Empty when not set. */
  workingOn: string;
  isHost: boolean;
  /** ISO timestamp. */
  joinedAt: string;
  /** ISO timestamp, or null while not focusing. */
  focusingSince: string | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  text: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** A link or file on the room's shared shelf. Files are uploaded to storage first (see docs/ARCHITECTURE.md). */
export interface RoomResource {
  id: string;
  roomId: string;
  userId: string;
  type: ResourceType;
  title: string;
  url: string;
  /** Bytes, for files. Null for links. */
  size: number | null;
  /** The uploaded file's original name. Null for links. */
  fileName: string | null;
  /** Saves the file under its original name instead of opening it. Null for links. */
  downloadUrl: string | null;
  /** A small preview, for images only. Null for links and PDFs. */
  thumbnailUrl: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

/** One logged focus session, sent to the room when it ends. */
export interface SessionSummary {
  id: string;
  roundsCompleted: number;
  goalsDone: number;
  participants: number;
}

/**
 * One notification, as the bell and notification:new show it. `text` is the headline ("Maya Kapoor opened a
 * room"); `roomName` goes on the detail line. A grouped burst keeps its id and is sent again when it grows.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  roomId: string;
  roomName: string;
  text: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** A notification in GET /api/notifications. */
export interface NotificationListItem extends AppNotification {
  /** The room is still open, so a room alert can offer Join. */
  roomOpen: boolean;
}

/** The public room someone you follow is in, for the sidebar's live dot. Private rooms are never shown. */
export interface FollowLiveRoom {
  id: string;
  name: string;
  /** They're hosting it ("Hosting …") rather than studying in it. */
  isHost: boolean;
}

/** Whether someone you follow is in a public room right now. */
export interface FollowLive {
  userId: string;
  room: FollowLiveRoom | null;
}
