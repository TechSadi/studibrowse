import { uploadsUnavailable } from '../../modules/resources/resources.errors';
import type { StorageService } from './storageService';

/**
 * Used when Cloudinary isn't configured (allowed outside production). Links still work; signing an upload
 * fails with UPLOADS_UNAVAILABLE, and with nothing ever uploaded there is nothing to find or delete.
 */
export function createDisabledStorageService(): StorageService {
  return {
    enabled: false,
    signUpload() {
      throw uploadsUnavailable();
    },
    findRoomFile: async () => null,
    deleteFile: async () => undefined,
    deleteRoomFiles: async () => undefined,
    downloadUrl: (url) => url,
    thumbnailUrl: (url) => url,
  };
}
