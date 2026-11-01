import { ApiError } from '../../lib/api';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

interface Issue {
  path: readonly PropertyKey[];
  message: string;
}

/** First zod issue message per top-level field, e.g. `{ email: 'Enter a valid email.' }`. */
export function issuesToFieldErrors<K extends string>(issues: readonly Issue[]): FieldErrors<K> {
  const errors: FieldErrors<K> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in errors)) errors[field as K] = issue.message;
  }
  return errors;
}

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * Splits a failed request into an error for one field (by server error code) or a form-level message.
 * Server messages are written for people (see auth.errors.ts), so they are shown as they are.
 */
export function serverError<K extends string>(
  err: unknown,
  fieldByCode: Partial<Record<string, K>> = {},
): { field?: K; message: string } {
  if (!(err instanceof ApiError)) return { message: GENERIC_ERROR };
  const field = fieldByCode[err.code];
  return field ? { field, message: err.message } : { message: err.message };
}
