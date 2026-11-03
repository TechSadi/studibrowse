import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import type { Env } from '../config/env';

/**
 * Error tracking with Sentry. Only unexpected errors are sent: the logger reports every error-level log that carries
 * an `err` (see reportLoggedError in logger.ts). AppErrors are answers, not bugs, and are never logged as errors.
 * Without SENTRY_DSN every function here does nothing, so tests and local dev never send events.
 *
 * Errors only: no tracing, so no `--import` instrumentation hook is needed.
 */

// index.ts installs its own process handlers (log, which reports, then exit), so Sentry's would only report twice and
// exit on their own schedule.
const REPLACED_INTEGRATIONS = new Set(['OnUncaughtException', 'OnUnhandledRejection']);

export type MonitoringEnv = Pick<Env, 'SENTRY_DSN' | 'NODE_ENV' | 'release'>;

/** Starts Sentry when a DSN is configured. Returns whether it did. */
export function initMonitoring(env: MonitoringEnv): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.release,
    // Collect no personal or request data; scrubEvent below is a second layer.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    integrations: (defaults) =>
      defaults.filter((integration) => !REPLACED_INTEGRATIONS.has(integration.name)),
    beforeSend: scrubEvent,
  });
  return true;
}

/**
 * Removes what could carry credentials or personal data: headers (Authorization, Cookie), cookies, bodies
 * (passwords) and query strings (reset tokens). The method and path are enough to find the route.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { method, url: url?.split('?')[0] };
  }
  if (event.user) event.user = event.user.id === undefined ? undefined : { id: event.user.id };
  return event;
}

/** Reports an unexpected error with a few fields to find it by (request id, event name, user id). */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(err, context && { extra: context });
}

/** Sends what's queued before the process exits. Resolves straight away when Sentry is off. */
export async function flushMonitoring(timeoutMs: number): Promise<void> {
  if (!Sentry.isInitialized()) return;
  await Sentry.close(timeoutMs);
}
