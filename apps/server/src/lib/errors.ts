import type { ApiErrorBody } from '@studibrowse/shared';

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}
