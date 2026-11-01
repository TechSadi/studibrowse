import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { ALLOWED_FILE_TYPES } from '@studibrowse/shared';
import type { StorageService, StoredFile } from './storageService';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const API_BASE = 'https://api.cloudinary.com/v1_1';
const DELIVERY_BASE = 'https://res.cloudinary.com';
/** Every room's files live under here, one folder per room, so closing a room can delete by prefix. */
export const ROOMS_FOLDER = 'studibrowse/rooms';
const ALLOWED_FORMATS = [...new Set(Object.values(ALLOWED_FILE_TYPES))].join(',');
/** 2x the 40px tile in the Files tab. */
const THUMBNAIL_TRANSFORM = 'c_fill,w_80,h_80,f_auto,q_auto';
/** Admin API prefix deletes stop at 1000 files per call; a room never gets near that, but loop to be sure. */
const MAX_PREFIX_DELETE_CALLS = 5;

/**
 * Cloudinary's signature: the params sorted by name as `k=v&k=v`, then the API secret, SHA-1 hex.
 * https://cloudinary.com/documentation/authentication_signatures
 */
export function signParams(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');
}

/** Cloudinary only takes letters, digits, `-` and `_` in an attachment name, and adds the extension itself. */
export function attachmentName(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return base
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Uses the built-in fetch and node:crypto, so there's no need for Cloudinary's SDK.
export function createCloudinaryStorageService({
  cloudName,
  apiKey,
  apiSecret,
}: CloudinaryConfig): StorageService {
  const uploadPrefix = `${DELIVERY_BASE}/${cloudName}/image/upload/`;
  const adminBase = `${API_BASE}/${cloudName}/resources/image/upload`;
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
  // A plain delivery url of an original upload: optional version, then our folder. No transformations, so
  // a shared url can't point at a converted copy (a PDF delivered as an image, say).
  const fileUrlPattern = new RegExp(
    `^${escapeRegExp(uploadPrefix)}(?:v\\d+/)?(${escapeRegExp(ROOMS_FOLDER)}/([a-f0-9]{24})/[A-Za-z0-9_-]+)\\.([a-z0-9]+)$`,
  );

  function parse(url: string): { publicId: string; roomId: string; extension: string } | null {
    const match = fileUrlPattern.exec(url);
    if (!match) return null;
    return { publicId: match[1]!, roomId: match[2]!, extension: match[3]! };
  }

  async function admin(method: 'GET' | 'DELETE', url: string): Promise<Response> {
    const res = await fetch(url, { method, headers: { Authorization: authorization } });
    if (!res.ok && res.status !== 404)
      throw new Error(`Cloudinary ${method} failed with status ${res.status}`);
    return res;
  }

  /** Puts a transformation right after `/upload/`, where Cloudinary expects it. */
  function transform(url: string, transformation: string): string {
    if (!url.startsWith(uploadPrefix)) return url;
    return `${uploadPrefix}${transformation}/${url.slice(uploadPrefix.length)}`;
  }

  return {
    enabled: true,

    signUpload(roomId) {
      const params = {
        allowed_formats: ALLOWED_FORMATS,
        // A signature stays valid for an hour; without this it could replace a file after it was checked.
        overwrite: 'false',
        public_id: `${ROOMS_FOLDER}/${roomId}/${nanoid()}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
      };
      return {
        uploadUrl: `${API_BASE}/${cloudName}/image/upload`,
        fields: { ...params, api_key: apiKey, signature: signParams(params, apiSecret) },
      };
    },

    async findRoomFile(roomId, url) {
      const parsed = parse(url);
      if (!parsed || parsed.roomId !== roomId) return null;
      const res = await admin('GET', `${adminBase}/${parsed.publicId}`);
      if (res.status === 404) return null;
      const body = (await res.json()) as { bytes?: unknown; format?: unknown };
      if (typeof body.bytes !== 'number' || typeof body.format !== 'string') return null;
      // The extension decides how Cloudinary delivers it, so it must be the file's own format.
      if (body.format !== parsed.extension) return null;
      return { bytes: body.bytes, format: body.format } satisfies StoredFile;
    },

    async deleteFile(url) {
      const parsed = parse(url);
      if (!parsed) return;
      await admin('DELETE', `${adminBase}?public_ids[]=${encodeURIComponent(parsed.publicId)}`);
    },

    async deleteRoomFiles(roomId) {
      const prefix = encodeURIComponent(`${ROOMS_FOLDER}/${roomId}/`);
      for (let call = 0; call < MAX_PREFIX_DELETE_CALLS; call += 1) {
        const res = await admin('DELETE', `${adminBase}?prefix=${prefix}`);
        const body = (await res.json().catch(() => ({}))) as { partial?: boolean };
        if (!body.partial) return;
      }
    },

    downloadUrl(url, fileName) {
      const name = attachmentName(fileName);
      return transform(url, name ? `fl_attachment:${name}` : 'fl_attachment');
    },

    thumbnailUrl(url) {
      return transform(url, THUMBNAIL_TRANSFORM);
    },
  };
}
