import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/react';
import { ApiError } from './api';
import { config } from './config';

/**
 * Error tracking with Sentry. Without a DSN (dev, tests) nothing starts and reportError does nothing.
 * Errors only: no tracing, no session replay.
 */

interface ErrorTrackingOptions {
  sentryDsn: string;
  sentryRelease: string | undefined;
  mode: string;
}

/** Starts Sentry before the first render. Returns whether it did. */
export function initErrorTracking(options: ErrorTrackingOptions = config): boolean {
  if (!options.sentryDsn) return false;
  Sentry.init({
    dsn: options.sentryDsn,
    environment: options.mode,
    release: options.sentryRelease,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  return true;
}

/** Reports an error the app caught itself (the route error page). */
export function reportError(error: unknown): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error);
}

/** Page and request URLs can carry secrets in the query string, like the password reset token. */
function withoutQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split(/[?#]/)[0] : url;
}

/**
 * Drops expected failures: an ApiError under 500 is an answer the screen already shows (wrong password, offline),
 * not a bug. Strips the query string from the page URL.
 */
export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  const error = hint.originalException;
  if (error instanceof ApiError && error.status < 500) return null;
  if (event.request) event.request = { url: withoutQuery(event.request.url) as string | undefined };
  return event;
}

/** Navigation and fetch breadcrumbs keep their path, never their query string. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ['url', 'from', 'to']) if (key in data) data[key] = withoutQuery(data[key]);
  return { ...breadcrumb, data };
}
