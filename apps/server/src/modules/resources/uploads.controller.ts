import type { RequestHandler } from 'express';
import type { RoomIdParams, UploadSignData, UploadSignResponse } from '@studibrowse/shared';
import type { StorageService } from '../../lib/storage';
import { signRoomUpload } from './resources.service';

// requireAuth runs first, so userId is set.

export function createUploadsController(storage: StorageService) {
  const sign: RequestHandler<RoomIdParams, UploadSignResponse, UploadSignData> = (req, res) => {
    res.json(signRoomUpload(storage, req.params.id, req.userId!));
  };
  return { sign };
}
