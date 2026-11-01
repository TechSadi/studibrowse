import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachmentName,
  createCloudinaryStorageService,
  ROOMS_FOLDER,
  signParams,
} from './cloudinaryStorageService';
import { createStorageService } from './index';

const config = { cloudName: 'demo', apiKey: '1234', apiSecret: 'secret' };
const storage = createCloudinaryStorageService(config);
const roomId = '64b7f0c2a1b2c3d4e5f60718';
const otherRoomId = '64b7f0c2a1b2c3d4e5f60719';
const publicId = `${ROOMS_FOLDER}/${roomId}/abc_DEF-123`;
const fileUrl = `https://res.cloudinary.com/demo/image/upload/v1700000000/${publicId}.pdf`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('signParams', () => {
  it('matches the example in Cloudinary’s documentation', () => {
    const params = {
      timestamp: '1315060510',
      public_id: 'sample_image',
      eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
    };
    expect(signParams(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
});

describe('signUpload', () => {
  it('signs a one-off upload into the room’s folder that only takes the allowed formats', () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T12:00:00Z') });
    const { uploadUrl, fields } = storage.signUpload(roomId);

    expect(uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(fields.public_id).toMatch(new RegExp(`^${ROOMS_FOLDER}/${roomId}/[A-Za-z0-9_-]+$`));
    expect(fields.allowed_formats).toBe('pdf,jpg,png,gif,webp');
    expect(fields.overwrite).toBe('false');
    expect(fields.timestamp).toBe(String(Date.parse('2026-11-01T12:00:00Z') / 1000));
    expect(fields.api_key).toBe('1234');
    const { api_key: _key, signature, ...signed } = fields;
    expect(signature).toBe(signParams(signed, 'secret'));
  });

  it('gives every upload its own id', () => {
    expect(storage.signUpload(roomId).fields.public_id).not.toBe(storage.signUpload(roomId).fields.public_id);
  });
});

describe('findRoomFile', () => {
  it('asks the Admin API for the real size and format of one of the room’s files', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bytes: 2048, format: 'pdf' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await storage.findRoomFile(roomId, fileUrl)).toEqual({ bytes: 2048, format: 'pdf' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.cloudinary.com/v1_1/demo/resources/image/upload/${publicId}`);
    expect(init.headers).toMatchObject({ Authorization: `Basic ${btoa('1234:secret')}` });
  });

  it.each([
    ['another account', fileUrl.replace('/demo/', '/someone-else/')],
    ['another host', fileUrl.replace('res.cloudinary.com', 'res.cloudinary.com.evil.test')],
    ['another room', fileUrl.replace(roomId, otherRoomId)],
    ['another folder', 'https://res.cloudinary.com/demo/image/upload/v1/elsewhere/abc.pdf'],
    ['a transformed copy', fileUrl.replace('/upload/', '/upload/f_jpg/')],
    ['a raw upload', fileUrl.replace('/image/', '/raw/')],
    ['plain http', fileUrl.replace('https:', 'http:')],
  ])('refuses a url from %s without calling Cloudinary', async (_case, url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await storage.findRoomFile(roomId, url)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a url without a version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ bytes: 10, format: 'pdf' })));
    const url = fileUrl.replace('v1700000000/', '');
    expect(await storage.findRoomFile(roomId, url)).toEqual({ bytes: 10, format: 'pdf' });
  });

  it('is null when the file is missing or its extension isn’t its real format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: {} }, 404)));
    expect(await storage.findRoomFile(roomId, fileUrl)).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ bytes: 10, format: 'png' })));
    expect(await storage.findRoomFile(roomId, fileUrl)).toBeNull();
  });

  it('throws when Cloudinary fails, so the share is refused rather than trusted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(storage.findRoomFile(roomId, fileUrl)).rejects.toThrow(/500/);
  });
});

describe('deleting', () => {
  it('deletes one file by its public id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deleted: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await storage.deleteFile(fileUrl);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(url).toBe(
      `https://api.cloudinary.com/v1_1/demo/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`,
    );
  });

  it('ignores urls that aren’t ours', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await storage.deleteFile('https://example.com/notes.pdf');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes a room’s folder by prefix, again while Cloudinary says there is more', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ partial: true }))
      .mockResolvedValueOnce(jsonResponse({ partial: false }));
    vi.stubGlobal('fetch', fetchMock);

    await storage.deleteRoomFiles(roomId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      `https://api.cloudinary.com/v1_1/demo/resources/image/upload?prefix=${encodeURIComponent(`${ROOMS_FOLDER}/${roomId}/`)}`,
    );
  });
});

describe('derived urls', () => {
  it('builds an attachment url that saves under the original name', () => {
    expect(storage.downloadUrl(fileUrl, 'Lecture 9 (final).pdf')).toBe(
      `https://res.cloudinary.com/demo/image/upload/fl_attachment:Lecture_9_final/v1700000000/${publicId}.pdf`,
    );
  });

  it('falls back to a plain attachment when nothing of the name is usable', () => {
    expect(storage.downloadUrl(fileUrl, '笔记.pdf')).toContain('/upload/fl_attachment/v1700000000/');
  });

  it('builds a small square thumbnail url', () => {
    expect(storage.thumbnailUrl(fileUrl)).toBe(
      `https://res.cloudinary.com/demo/image/upload/c_fill,w_80,h_80,f_auto,q_auto/v1700000000/${publicId}.pdf`,
    );
  });
});

describe('attachmentName', () => {
  it('drops the extension and anything Cloudinary won’t take', () => {
    expect(attachmentName('Linear algebra formula sheet.pdf')).toBe('Linear_algebra_formula_sheet');
    expect(attachmentName('photo.JPEG')).toBe('photo');
    expect(attachmentName('__a--b__.png')).toBe('a--b');
  });
});

describe('createStorageService', () => {
  it('uses Cloudinary only when all three settings are there', () => {
    const settings = {
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '1234',
      CLOUDINARY_API_SECRET: 'secret',
    };
    expect(createStorageService(settings).enabled).toBe(true);
    expect(createStorageService({ ...settings, CLOUDINARY_API_SECRET: undefined }).enabled).toBe(false);
  });

  it('refuses to sign uploads when disabled', () => {
    const disabled = createStorageService({
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
    });
    expect(() => disabled.signUpload(roomId)).toThrow(
      expect.objectContaining({ code: 'UPLOADS_UNAVAILABLE' }),
    );
  });
});
