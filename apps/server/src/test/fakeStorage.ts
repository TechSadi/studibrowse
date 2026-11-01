import type { StorageService, StoredFile } from '../lib/storage';

export const FAKE_STORAGE_ORIGIN = 'https://files.test';

/** A StorageService in memory. `put` adds a file the way a client upload would, and returns its url. */
export interface FakeStorage extends StorageService {
  put(roomId: string, file: StoredFile & { name?: string }): string;
  /** Urls passed to deleteFile, in order. */
  deletedFiles: string[];
  /** Room ids passed to deleteRoomFiles, in order. */
  deletedRooms: string[];
  /** Makes deleteRoomFiles throw, to test that cleanup carries on. */
  failRoomDeletes: boolean;
}

export function createFakeStorage(): FakeStorage {
  const files = new Map<string, StoredFile>();
  let count = 0;

  const fake: FakeStorage = {
    enabled: true,
    deletedFiles: [],
    deletedRooms: [],
    failRoomDeletes: false,

    put(roomId, { name, ...file }) {
      count += 1;
      const url = `${FAKE_STORAGE_ORIGIN}/${roomId}/${name ?? `file${count}`}.${file.format}`;
      files.set(url, file);
      return url;
    },

    signUpload(roomId) {
      return { uploadUrl: `${FAKE_STORAGE_ORIGIN}/upload`, fields: { folder: roomId, signature: 'signed' } };
    },

    async findRoomFile(roomId, url) {
      if (!url.startsWith(`${FAKE_STORAGE_ORIGIN}/${roomId}/`)) return null;
      return files.get(url) ?? null;
    },

    async deleteFile(url) {
      fake.deletedFiles.push(url);
      files.delete(url);
    },

    async deleteRoomFiles(roomId) {
      if (fake.failRoomDeletes) throw new Error('storage is down');
      fake.deletedRooms.push(roomId);
      for (const url of files.keys()) {
        if (url.startsWith(`${FAKE_STORAGE_ORIGIN}/${roomId}/`)) files.delete(url);
      }
    },

    downloadUrl: (url, fileName) => `${url}?download=${encodeURIComponent(fileName)}`,
    thumbnailUrl: (url) => `${url}?thumb`,
  };
  return fake;
}
