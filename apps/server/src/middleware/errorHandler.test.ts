import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { errorHandler, notFoundHandler } from './errorHandler';

function appThatThrows(error: unknown) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/boom', () => {
    throw error;
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('errorHandler', () => {
  it('returns the status, code and message of an AppError', async () => {
    const res = await request(appThatThrows(new AppError(409, 'TAKEN', 'Username taken.'))).post('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'TAKEN', message: 'Username taken.' } });
  });

  it('hides the details of unexpected errors but logs them', async () => {
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const error = new Error('secret internal detail');
    const res = await request(appThatThrows(error)).post('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
    expect(res.text).not.toContain('secret');
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ err: error }), 'unhandled error');
  });

  it('never sends a stack trace in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const res = await request(appThatThrows(new TypeError('x is undefined'))).post('/boom');

    expect(res.status).toBe(500);
    expect(Object.keys(res.body.error)).toEqual(['code', 'message']);
    // Stack frames look like "at fn (file.ts:12:34)".
    expect(res.text).not.toMatch(/at .+:\d+:\d+/);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(appThatThrows(new Error('unreachable')))
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 413 for a body over the size limit', async () => {
    const res = await request(appThatThrows(new Error('unreachable')))
      .post('/boom')
      .send({ text: 'a'.repeat(2048) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
    });
  });

  it('returns 404 in the standard shape for unknown routes', async () => {
    const res = await request(appThatThrows(null)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
});
