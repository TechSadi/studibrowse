import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import { captureError, flushMonitoring, initMonitoring, scrubEvent } from './monitoring';

vi.mock('@sentry/node', async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  init: vi.fn(),
  captureException: vi.fn(),
  close: vi.fn(),
}));

describe('monitoring without a DSN', () => {
  it('does not start Sentry', () => {
    expect(initMonitoring({ SENTRY_DSN: undefined, NODE_ENV: 'test', release: undefined })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('captures and flushes nothing', async () => {
    captureError(new Error('boom'), { reqId: 'r1' });
    await flushMonitoring(10);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.close).not.toHaveBeenCalled();
  });
});

describe('scrubEvent', () => {
  it('keeps only the method and the path of the request', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api.example.com/api/auth/reset?token=secret',
        headers: { authorization: 'Bearer token', cookie: 'sb_refresh=abc' },
        cookies: { sb_refresh: 'abc' },
        data: { password: 'hunter2' },
        query_string: 'token=secret',
      },
    });
    expect(event.request).toEqual({ method: 'POST', url: 'https://api.example.com/api/auth/reset' });
  });

  it('keeps only the user id', () => {
    const event = scrubEvent({ type: undefined, user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' } });
    expect(event.user).toEqual({ id: 'u1' });
    expect(scrubEvent({ type: undefined, user: { ip_address: '1.2.3.4' } }).user).toBeUndefined();
  });
});
