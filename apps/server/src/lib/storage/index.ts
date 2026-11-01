import type { Env } from '../../config/env';
import { createCloudinaryStorageService } from './cloudinaryStorageService';
import { createDisabledStorageService } from './disabledStorageService';
import type { StorageService } from './storageService';

export type { StorageService, StoredFile } from './storageService';

export function createStorageService(
  env: Pick<Env, 'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET'>,
): StorageService {
  // env.ts requires all three in production; elsewhere uploads are simply off until they're set.
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return createCloudinaryStorageService({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    });
  }
  return createDisabledStorageService();
}
