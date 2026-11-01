import { z } from 'zod';
import {
  ALLOWED_FILE_TYPES,
  FILE_NAME_MAX,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  type AllowedFileType,
} from '../constants';

export const fileNameSchema = z
  .string()
  .trim()
  .min(1, 'The file needs a name.')
  .max(FILE_NAME_MAX, `Rename the file to ${FILE_NAME_MAX} characters or fewer.`);

export const fileSizeSchema = z
  .number()
  .int()
  .positive('That file is empty.')
  .max(MAX_FILE_BYTES, `Files can be up to ${MAX_FILE_MB} MB.`);

const FILE_TYPES = Object.keys(ALLOWED_FILE_TYPES) as [AllowedFileType, ...AllowedFileType[]];

export function isAllowedFileType(type: string): type is AllowedFileType {
  return Object.hasOwn(ALLOWED_FILE_TYPES, type);
}

/** POST /api/rooms/:id/uploads/sign: what the client is about to upload, checked before it is signed. */
export const uploadSignSchema = z.strictObject({
  fileName: fileNameSchema,
  size: fileSizeSchema,
  contentType: z.enum(FILE_TYPES, 'You can share PDFs and images (JPG, PNG, GIF or WebP).'),
});

export type UploadSignInput = z.input<typeof uploadSignSchema>;
export type UploadSignData = z.output<typeof uploadSignSchema>;
