import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_CODE } from '../../../lib/api';
import { UPLOAD_FAILED_CODE, uploadFile } from './uploadFile';

/** Just enough of XMLHttpRequest to drive an upload by hand. */
class FakeXhr {
  static last: FakeXhr | null = null;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  body: FormData | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const signed = {
  uploadUrl: 'https://upload.test/image/upload',
  fields: { signature: 'abc', timestamp: '1' },
};
const file = new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' });

function xhr(): FakeXhr {
  if (!FakeXhr.last) throw new Error('No request was made');
  return FakeXhr.last;
}

beforeEach(() => {
  FakeXhr.last = null;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadFile', () => {
  it('posts the signed fields and the file, reports progress and resolves with the stored url', async () => {
    const onProgress = vi.fn();
    const uploading = uploadFile(signed, file, { onProgress });

    expect(xhr().method).toBe('POST');
    expect(xhr().url).toBe(signed.uploadUrl);
    expect(xhr().body?.get('signature')).toBe('abc');
    expect(xhr().body?.get('timestamp')).toBe('1');
    expect((xhr().body?.get('file') as File).name).toBe('notes.pdf');

    xhr().progress(50, 200);
    xhr().respond(200, { secure_url: 'https://files.test/notes.pdf' });

    await expect(uploading).resolves.toBe('https://files.test/notes.pdf');
    expect(onProgress.mock.calls).toEqual([[0.25], [1]]);
  });

  it('fails with a friendly message when storage refuses the file', async () => {
    const uploading = uploadFile(signed, file);
    xhr().respond(400, { error: { message: 'Image file format svg not allowed' } });
    await expect(uploading).rejects.toEqual(
      new ApiError(400, UPLOAD_FAILED_CODE, 'The upload didn’t go through. Try again.'),
    );
  });

  it('fails as a network error when the connection drops', async () => {
    const uploading = uploadFile(signed, file);
    xhr().onerror?.();
    await expect(uploading).rejects.toMatchObject({ code: NETWORK_ERROR_CODE });
  });

  it('stops when the signal aborts, before or during the upload', async () => {
    const controller = new AbortController();
    const uploading = uploadFile(signed, file, { signal: controller.signal });
    controller.abort();
    await expect(uploading).rejects.toMatchObject({ name: 'AbortError' });

    FakeXhr.last = null;
    await expect(uploadFile(signed, file, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(FakeXhr.last).toBeNull();
  });
});
