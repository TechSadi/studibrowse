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

export interface AppNotification {
  id: string;
  type: NotificationType;
  roomId: string;
  text: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}
