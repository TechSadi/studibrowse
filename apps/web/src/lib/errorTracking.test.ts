import * as Sentry from '@sentry/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { initErrorTracking, reportError, scrubBreadcrumb, scrubEvent } from './errorTracking';

vi.mock('@sentry/react', async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe('initErrorTracking', () => {
  it('does not start Sentry without a DSN', () => {
    expect(initErrorTracking({ sentryDsn: '', sentryRelease: undefined, mode: 'test' })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts Sentry with the release and environment when a DSN is set', () => {
    const options = {
      sentryDsn: 'https://key@o1.ingest.sentry.io/1',
      sentryRelease: 'abc123',
      mode: 'production',
    };
    expect(initErrorTracking(options)).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: options.sentryDsn, release: 'abc123', environment: 'production' }),
    );
  });
});

describe('reportError', () => {
  it('does nothing while Sentry is off', () => {
    reportError(new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('scrubEvent', () => {
  it('drops expected API errors and keeps server errors', () => {
    const event = { type: undefined };
    expect(
      scrubEvent(event, { originalException: new ApiError(401, 'INVALID_CREDENTIALS', 'x') }),
    ).toBeNull();
    expect(scrubEvent(event, { originalException: new ApiError(0, 'NETWORK_ERROR', 'x') })).toBeNull();
    expect(scrubEvent(event, { originalException: new ApiError(500, 'INTERNAL_ERROR', 'x') })).toBe(event);
    expect(scrubEvent(event, { originalException: new TypeError('x is undefined') })).toBe(event);
  });

  it('strips the query string and headers from the page request', () => {
    const event = scrubEvent(
      {
        type: undefined,
        request: {
          url: 'https://studibrowse.app/reset-password?token=secret',
          headers: { 'User-Agent': 'x' },
        },
      },
      {},
    );
    expect(event?.request).toEqual({ url: 'https://studibrowse.app/reset-password' });
  });
});

describe('scrubBreadcrumb', () => {
  it('strips query strings from navigation and fetch breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/login?next=/home', to: '/reset-password?token=s' },
      }).data,
    ).toEqual({ from: '/login', to: '/reset-password' });
    expect(
      scrubBreadcrumb({ category: 'fetch', data: { url: '/api/x?q=1', status_code: 200 } }).data,
    ).toEqual({
      url: '/api/x',
      status_code: 200,
    });
  });

  it('leaves breadcrumbs without data alone', () => {
    const crumb = { category: 'console', message: 'hi' };
    expect(scrubBreadcrumb(crumb)).toBe(crumb);
  });
});
