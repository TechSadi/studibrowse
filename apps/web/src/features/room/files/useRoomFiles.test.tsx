import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES } from '@studibrowse/shared';
import type * as ApiModule from '../../../lib/api';
import { clip, useRoomFiles } from './useRoomFiles';

const emitWithAck = vi.fn();
vi.mock('../../../lib/socket', () => ({
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const signUpload = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, roomsApi: { ...actual.roomsApi, signUpload } };
});

const uploadFile = vi.hoisted(() => vi.fn());
vi.mock('./uploadFile', () => ({ uploadFile }));

const ROOM = 'room-1';
const signed = { uploadUrl: 'https://upload.test', fields: { signature: 'abc' } };

function pdf(name = 'Lecture 9.pdf', size = 2048) {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** An upload the test finishes by hand, with the progress callback it was given. */
function deferredUpload() {
  let finish!: (url: string) => void;
  let fail!: (err: unknown) => void;
  let progress!: (fraction: number) => void;
  let signal!: AbortSignal;
  uploadFile.mockImplementationOnce(
    (_signed, _file, options: { onProgress: (n: number) => void; signal: AbortSignal }) => {
      progress = options.onProgress;
      signal = options.signal;
      return new Promise<string>((resolve, reject) => {
        finish = resolve;
        fail = reject;
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      });
    },
  );
  return {
    finish: (url: string) => finish(url),
    fail: (err: unknown) => fail(err),
    progress: (fraction: number) => progress(fraction),
    signal: () => signal,
  };
}

beforeEach(() => {
  emitWithAck.mockReset().mockResolvedValue({});
  signUpload.mockReset().mockResolvedValue(signed);
  uploadFile.mockReset();
});
afterEach(cleanup);

describe('useRoomFiles', () => {
  it('shares a link', async () => {
    const { result } = renderHook(() => useRoomFiles(ROOM));
    await result.current.shareLink('Notes', 'https://example.com/notes');
    expect(emitWithAck).toHaveBeenCalledWith('resource:add', {
      roomId: ROOM,
      type: 'link',
      title: 'Notes',
      url: 'https://example.com/notes',
    });
  });

  it('signs, uploads with progress, then shares the file under its name', async () => {
    const upload = deferredUpload();
    const { result } = renderHook(() => useRoomFiles(ROOM));

    let sharing!: Promise<void>;
    act(() => {
      sharing = result.current.upload(pdf(), '');
    });
    await act(async () => undefined);
    expect(signUpload).toHaveBeenCalledWith(ROOM, {
      fileName: 'Lecture 9.pdf',
      size: 2048,
      contentType: 'application/pdf',
    });
    expect(result.current.uploads).toEqual([
      { id: expect.any(String) as unknown, name: 'Lecture 9.pdf', progress: 0 },
    ]);

    act(() => upload.progress(0.5));
    expect(result.current.uploads[0]?.progress).toBe(0.5);

    await act(async () => {
      upload.finish('https://files.test/lecture.pdf');
      await sharing;
    });
    expect(emitWithAck).toHaveBeenCalledWith('resource:add', {
      roomId: ROOM,
      type: 'file',
      title: 'Lecture 9.pdf',
      url: 'https://files.test/lecture.pdf',
      size: 2048,
      fileName: 'Lecture 9.pdf',
    });
    expect(result.current.uploads).toEqual([]);
  });

  it('uses the typed title when there is one', async () => {
    uploadFile.mockResolvedValueOnce('https://files.test/a.pdf');
    const { result } = renderHook(() => useRoomFiles(ROOM));
    await act(() => result.current.upload(pdf(), 'Week 3 slides'));
    expect(emitWithAck).toHaveBeenCalledWith(
      'resource:add',
      expect.objectContaining({ title: 'Week 3 slides' }),
    );
  });

  it('refuses the wrong type or a file over the limit without asking the server', async () => {
    const { result } = renderHook(() => useRoomFiles(ROOM));
    const zip = new File(['x'], 'notes.zip', { type: 'application/zip' });

    await expect(result.current.upload(zip, '')).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    await expect(result.current.upload(pdf('big.pdf', MAX_FILE_BYTES + 1), '')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
    expect(signUpload).not.toHaveBeenCalled();
  });

  it('cancels quietly, without sharing anything', async () => {
    const upload = deferredUpload();
    const { result } = renderHook(() => useRoomFiles(ROOM));

    let sharing!: Promise<void>;
    act(() => {
      sharing = result.current.upload(pdf(), '');
    });
    await act(async () => undefined);
    await act(async () => {
      result.current.cancelUpload(result.current.uploads[0]!.id);
      await sharing;
    });

    expect(upload.signal().aborted).toBe(true);
    expect(emitWithAck).not.toHaveBeenCalled();
    expect(result.current.uploads).toEqual([]);
  });

  it('passes a failed upload on and clears its row', async () => {
    const upload = deferredUpload();
    const { result } = renderHook(() => useRoomFiles(ROOM));

    let sharing!: Promise<void>;
    act(() => {
      sharing = result.current.upload(pdf(), '');
    });
    await act(async () => undefined);
    upload.fail(new Error('The upload didn’t go through. Try again.'));
    await act(async () => {
      await expect(sharing).rejects.toThrow('The upload didn’t go through');
    });
    expect(result.current.uploads).toEqual([]);
  });

  it('cancels unfinished uploads when the room closes on screen', async () => {
    const upload = deferredUpload();
    const { result, unmount } = renderHook(() => useRoomFiles(ROOM));
    act(() => {
      void result.current.upload(pdf(), '');
    });
    await act(async () => undefined);
    unmount();
    expect(upload.signal().aborted).toBe(true);
  });

  it('removes a resource', async () => {
    const { result } = renderHook(() => useRoomFiles(ROOM));
    await result.current.remove('r1');
    expect(emitWithAck).toHaveBeenCalledWith('resource:remove', { roomId: ROOM, resourceId: 'r1' });
  });
});

describe('clip', () => {
  it('shortens long names but keeps the extension', () => {
    expect(clip('short.pdf', 20)).toBe('short.pdf');
    expect(clip(`${'a'.repeat(30)}.pdf`, 12)).toBe('aaaaaaaa.pdf');
    expect(clip('a'.repeat(30), 10)).toBe('a'.repeat(10));
  });
});
