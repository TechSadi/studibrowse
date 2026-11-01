import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FILE_NAME_MAX,
  isAllowedFileType,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  RESOURCE_TITLE_MAX,
  type AllowedFileType,
} from '@studibrowse/shared';
import { ApiError, roomsApi } from '../../../lib/api';
import { emitWithAck } from '../../../lib/socket';
import { uploadFile } from './uploadFile';

/** A file on its way to storage. */
export interface PendingUpload {
  id: string;
  name: string;
  /** 0 to 1. */
  progress: number;
}

export interface RoomFiles {
  uploads: PendingUpload[];
  /** Each of these throws ApiError with a message to show if it fails. */
  shareLink: (title: string, url: string) => Promise<void>;
  /** Resolves quietly if the upload is cancelled. */
  upload: (file: File, title: string) => Promise<void>;
  cancelUpload: (id: string) => void;
  remove: (resourceId: string) => Promise<void>;
}

/** What the file input accepts: the same list the server signs uploads for. */
export const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/gif,image/webp';

/** Shortens a name to `max` characters, keeping its extension. */
export function clip(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
  return name.slice(0, max - extension.length).trimEnd() + extension;
}

/**
 * The same checks the server makes, so a wrong file is refused before it is uploaded. Returns the file's
 * type, or throws ApiError.
 */
export function checkFile(file: File): AllowedFileType {
  if (!isAllowedFileType(file.type)) {
    throw new ApiError(0, 'FILE_TYPE_NOT_ALLOWED', 'You can share PDFs and images (JPG, PNG, GIF or WebP).');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(0, 'FILE_TOO_LARGE', `Files can be up to ${MAX_FILE_MB} MB.`);
  }
  if (file.size === 0) throw new ApiError(0, 'VALIDATION_ERROR', 'That file is empty.');
  return file.type;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * The Files tab's actions. A file is checked here, signed by the server, uploaded straight to storage with
 * progress, then shared with resource:add. The list itself comes from the room session (resource:new and
 * resource:removed), which the server sends before it acks.
 */
export function useRoomFiles(roomId: string): RoomFiles {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const nextId = useRef(0);

  // Leaving the room cancels uploads that haven't finished.
  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
    };
  }, []);

  const shareLink = useCallback(
    async (title: string, url: string) => {
      await emitWithAck('resource:add', { roomId, type: 'link', title, url });
    },
    [roomId],
  );

  const upload = useCallback(
    async (file: File, title: string) => {
      const contentType = checkFile(file);

      const id = `upload-${(nextId.current += 1)}`;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      const fileName = clip(file.name.trim() || 'file', FILE_NAME_MAX);
      setUploads((current) => [...current, { id, name: fileName, progress: 0 }]);
      const setProgress = (progress: number) =>
        setUploads((current) => current.map((item) => (item.id === id ? { ...item, progress } : item)));

      try {
        const signed = await roomsApi.signUpload(roomId, {
          fileName,
          size: file.size,
          contentType,
        });
        const url = await uploadFile(signed, file, { onProgress: setProgress, signal: controller.signal });
        if (controller.signal.aborted) return;
        await emitWithAck('resource:add', {
          roomId,
          type: 'file',
          title: clip(title || fileName, RESOURCE_TITLE_MAX),
          url,
          size: file.size,
          fileName,
        });
      } catch (err) {
        if (isAbort(err) || controller.signal.aborted) return;
        throw err;
      } finally {
        controllers.current.delete(id);
        setUploads((current) => current.filter((item) => item.id !== id));
      }
    },
    [roomId],
  );

  const cancelUpload = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const remove = useCallback(
    async (resourceId: string) => {
      await emitWithAck('resource:remove', { roomId, resourceId });
    },
    [roomId],
  );

  return { uploads, shareLink, upload, cancelUpload, remove };
}
