import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES } from '../constants';
import { isAllowedFileType, uploadSignSchema } from './uploads';

describe('uploadSignSchema', () => {
  const pdf = { fileName: ' Lecture 9.pdf ', size: 2048, contentType: 'application/pdf' };

  it('accepts PDFs and images up to the size limit, trimming the name', () => {
    expect(uploadSignSchema.parse(pdf).fileName).toBe('Lecture 9.pdf');
    const png = { ...pdf, contentType: 'image/png', size: MAX_FILE_BYTES };
    expect(uploadSignSchema.safeParse(png).success).toBe(true);
  });

  it('rejects other types, empty or oversized files and unknown fields', () => {
    expect(uploadSignSchema.safeParse({ ...pdf, contentType: 'application/zip' }).success).toBe(false);
    expect(uploadSignSchema.safeParse({ ...pdf, contentType: 'image/svg+xml' }).success).toBe(false);
    expect(uploadSignSchema.safeParse({ ...pdf, size: 0 }).success).toBe(false);
    expect(uploadSignSchema.safeParse({ ...pdf, size: MAX_FILE_BYTES + 1 }).success).toBe(false);
    expect(uploadSignSchema.safeParse({ ...pdf, folder: 'elsewhere' }).success).toBe(false);
  });
});

describe('isAllowedFileType', () => {
  it('knows the allowed MIME types and nothing inherited', () => {
    expect(isAllowedFileType('image/webp')).toBe(true);
    expect(isAllowedFileType('text/html')).toBe(false);
    expect(isAllowedFileType('toString')).toBe(false);
  });
});
