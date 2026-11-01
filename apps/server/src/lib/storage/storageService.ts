import type { UploadSignResponse } from '@studibrowse/shared';

/** A file in storage, as the storage provider reports it (not as the client claims). */
export interface StoredFile {
  /** Bytes. */
  bytes: number;
  /** The provider's format name, e.g. `pdf` or `jpg` (see ALLOWED_FILE_TYPES). */
  format: string;
}

/**
 * Where room files live. Cloudinary when configured; tests pass a fake. Clients upload straight to the
 * provider with a signature from `signUpload`, so file bytes never pass through this server.
 */
export interface StorageService {
  /** False when no provider is configured (local development without credentials): uploads are refused. */
  readonly enabled: boolean;
  /** A one-off signed upload into the room's folder. */
  signUpload(roomId: string): UploadSignResponse;
  /**
   * The stored file behind `url`, or null unless the url points at a file in this room's folder of our own
   * account and the file exists.
   */
  findRoomFile(roomId: string, url: string): Promise<StoredFile | null>;
  /** Deletes the file behind one of our urls. Does nothing for a url that isn't ours. */
  deleteFile(url: string): Promise<void>;
  /** Deletes everything in the room's folder, shared or not. */
  deleteRoomFiles(roomId: string): Promise<void>;
  /** A url that makes the browser save the file as `fileName` instead of opening it. */
  downloadUrl(url: string, fileName: string): string;
  /** A small square preview of an image. */
  thumbnailUrl(url: string): string;
}
