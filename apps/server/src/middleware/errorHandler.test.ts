import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/errors';
import { errorHandler, notFoundHandler } from './errorHandler';

function appThatThrows(error: unknown) {
  const app = express();
  app.use(express.json());
  app.post('/boom', () => {
    throw error;
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('returns the status, code and message of an AppError', async () => {
    const res = await request(appThatThrows(new AppError(409, 'TAKEN', 'Username taken.'))).post('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'TAKEN', message: 'Username taken.' } });
  });

  it('hides the details of unexpected errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appThatThrows(new Error('secret internal detail'))).post('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(appThatThrows(new Error('unreachable')))
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 404 in the standard shape for unknown routes', async () => {
    const res = await request(appThatThrows(null)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
});
