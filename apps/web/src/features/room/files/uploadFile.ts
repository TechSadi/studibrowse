import type { UploadSignResponse } from '@studibrowse/shared';
import { ApiError, NETWORK_ERROR_CODE } from '../../../lib/api';

export const UPLOAD_FAILED_CODE = 'UPLOAD_FAILED';

interface UploadOptions {
  /** 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Posts the file straight to storage with the server's signature and resolves with the stored file's url.
 * XMLHttpRequest rather than fetch, because fetch can't report upload progress. Rejects with an AbortError
 * when `signal` aborts, and with ApiError otherwise.
 */
export function uploadFile(
  { uploadUrl, fields }: UploadSignResponse,
  file: File,
  { onProgress, signal }: UploadOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    body.append('file', file);

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      done();
      const url = secureUrl(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && url) {
        onProgress?.(1);
        resolve(url);
      } else {
        reject(new ApiError(xhr.status, UPLOAD_FAILED_CODE, 'The upload didn’t go through. Try again.'));
      }
    };
    xhr.onerror = () => {
      done();
      reject(new ApiError(0, NETWORK_ERROR_CODE, 'The upload stopped. Check your connection and try again.'));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.open('POST', uploadUrl);
    xhr.send(body);
  });
}

function secureUrl(responseText: string): string | null {
  try {
    const body = JSON.parse(responseText) as { secure_url?: unknown };
    return typeof body.secure_url === 'string' ? body.secure_url : null;
  } catch {
    return null;
  }
}
