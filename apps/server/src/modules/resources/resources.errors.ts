import { MAX_FILE_MB } from '@studibrowse/shared';
import { AppError } from '../../lib/errors';

export const resourceNotFound = () =>
  new AppError(404, 'RESOURCE_NOT_FOUND', 'That isn’t in the room’s files any more.');

export const notResourceAuthor = () =>
  new AppError(403, 'NOT_RESOURCE_AUTHOR', 'Only the person who shared it or the host can remove it.');

export const resourceExists = () =>
  new AppError(409, 'RESOURCE_EXISTS', 'That file is already in the room’s files.');

/** Not one of our uploads, uploaded for another room, or not there any more. */
export const invalidFile = () =>
  new AppError(400, 'INVALID_FILE', 'That upload didn’t work. Try uploading the file again.');

export const fileTooLarge = () =>
  new AppError(413, 'FILE_TOO_LARGE', `Files can be up to ${MAX_FILE_MB} MB.`);

export const fileTypeNotAllowed = () =>
  new AppError(415, 'FILE_TYPE_NOT_ALLOWED', 'You can share PDFs and images (JPG, PNG, GIF or WebP).');

export const uploadsUnavailable = () =>
  new AppError(
    503,
    'UPLOADS_UNAVAILABLE',
    'File uploads aren’t available right now. You can still share links.',
  );
