import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES } from '@studibrowse/shared';
import { canRemoveResource, checkStoredFile } from './resources.service';

describe('canRemoveResource', () => {
  it('lets whoever shared it or the host remove it, nobody else', () => {
    expect(canRemoveResource('alice', 'alice', false)).toBe(true);
    expect(canRemoveResource('alice', 'host', true)).toBe(true);
    expect(canRemoveResource('alice', 'bob', false)).toBe(false);
  });
});

describe('checkStoredFile', () => {
  it('allows PDFs and images up to the size limit', () => {
    expect(checkStoredFile({ bytes: MAX_FILE_BYTES, format: 'pdf' })).toBe('ok');
    expect(checkStoredFile({ bytes: 1, format: 'webp' })).toBe('ok');
  });

  it('refuses larger files and other formats', () => {
    expect(checkStoredFile({ bytes: MAX_FILE_BYTES + 1, format: 'jpg' })).toBe('tooLarge');
    expect(checkStoredFile({ bytes: 1, format: 'svg' })).toBe('wrongType');
    expect(checkStoredFile({ bytes: 1, format: 'zip' })).toBe('wrongType');
  });
});
