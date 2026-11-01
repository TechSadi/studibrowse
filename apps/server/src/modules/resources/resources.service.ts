import { Types } from 'mongoose';
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_BYTES,
  type RoomResource,
  type UploadSignResponse,
} from '@studibrowse/shared';
import { logger } from '../../lib/logger';
import type { StorageService } from '../../lib/storage';
import { isMember } from '../../realtime/presence';
import { Room } from '../rooms/room.model';
import { notAMember, roomClosed, roomNotFound } from '../rooms/rooms.errors';
import { Resource } from './resource.model';
import {
  fileTooLarge,
  fileTypeNotAllowed,
  invalidFile,
  notResourceAuthor,
  resourceExists,
  resourceNotFound,
  uploadsUnavailable,
} from './resources.errors';
import { toRoomResource, type ResourceRecord } from './resources.serializer';

const ALLOWED_FORMATS: ReadonlySet<string> = new Set(Object.values(ALLOWED_FILE_TYPES));
/** Cloudinary reports PDFs as `pdf`; every other allowed format is an image. */
const PDF_FORMAT = ALLOWED_FILE_TYPES['application/pdf'];

/** The person who shared something or the room's current host can remove it. */
export function canRemoveResource(sharedBy: string, userId: string, isHost: boolean): boolean {
  return isHost || sharedBy === userId;
}

/** Whether a stored file may be shared: an allowed format within the size limit. */
export function checkStoredFile(file: { bytes: number; format: string }): 'ok' | 'tooLarge' | 'wrongType' {
  if (!ALLOWED_FORMATS.has(file.format)) return 'wrongType';
  if (file.bytes > MAX_FILE_BYTES) return 'tooLarge';
  return 'ok';
}

async function requireOpenRoom(roomId: string): Promise<void> {
  const room = await Room.findById(roomId, { closedAt: 1 }).lean<{ closedAt: Date | null }>();
  if (!room) throw roomNotFound();
  if (room.closedAt) throw roomClosed();
}

async function save(fields: Record<string, unknown>): Promise<RoomResource> {
  const resource = await Resource.create(fields);
  return toRoomResource(resource.toObject() as ResourceRecord);
}

/**
 * A signed upload for someone in the room. The type and size were checked by uploadSignSchema; storage
 * checks them again on upload and addFile checks the stored file, since the client could lie here.
 */
export function signRoomUpload(storage: StorageService, roomId: string, userId: string): UploadSignResponse {
  if (!isMember(roomId, userId)) throw notAMember();
  if (!storage.enabled) throw uploadsUnavailable();
  return storage.signUpload(roomId);
}

/** `title` and `url` are already trimmed and checked (http/https only) by the shared resourceAddSchema. */
export async function addLink(
  roomId: string,
  userId: string,
  { title, url }: { title: string; url: string },
): Promise<RoomResource> {
  await requireOpenRoom(roomId);
  return save({ roomId, userId, type: 'link', title, url });
}

/**
 * Shares a file the client uploaded to storage. Storage is asked for the file's real size and type, so the
 * client's own `size` is never trusted; a file that breaks the rules is deleted from storage and refused.
 */
export async function addFile(
  storage: StorageService,
  roomId: string,
  userId: string,
  { title, url, fileName }: { title: string; url: string; fileName: string },
): Promise<RoomResource> {
  await requireOpenRoom(roomId);
  const file = await storage.findRoomFile(roomId, url);
  if (!file) throw invalidFile();

  const verdict = checkStoredFile(file);
  if (verdict !== 'ok') {
    await deleteStoredFile(storage, url);
    throw verdict === 'tooLarge' ? fileTooLarge() : fileTypeNotAllowed();
  }
  // Two resources on one file would let removing either delete the other's file.
  if (await Resource.exists({ roomId, url })) throw resourceExists();

  return save({
    roomId,
    userId,
    type: 'file',
    title,
    url,
    size: file.bytes,
    fileName,
    downloadUrl: storage.downloadUrl(url, fileName),
    thumbnailUrl: file.format === PDF_FORMAT ? null : storage.thumbnailUrl(url),
  });
}

/** Removes a resource and, for a file, deletes it from storage. */
export async function removeResource(
  storage: StorageService,
  roomId: string,
  resourceId: string,
  userId: string,
  isHost: boolean,
): Promise<void> {
  await requireOpenRoom(roomId);
  const resource = await Resource.findOne(
    { _id: new Types.ObjectId(resourceId), roomId },
    { userId: 1, type: 1, url: 1 },
  ).lean<Pick<ResourceRecord, 'userId' | 'type' | 'url'>>();
  if (!resource) throw resourceNotFound();
  if (!canRemoveResource(resource.userId.toString(), userId, isHost)) throw notResourceAuthor();

  const { deletedCount } = await Resource.deleteOne({ _id: resourceId });
  // Someone else removed it in the meantime.
  if (deletedCount === 0) throw resourceNotFound();
  if (resource.type === 'file') await deleteStoredFile(storage, resource.url);
}

/** Best effort: the room's folder is deleted anyway when the room closes. */
async function deleteStoredFile(storage: StorageService, url: string): Promise<void> {
  try {
    await storage.deleteFile(url);
  } catch (err) {
    logger.warn({ err, url }, '[resources] failed to delete a stored file');
  }
}
