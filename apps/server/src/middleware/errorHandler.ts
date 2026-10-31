import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@studibrowse/shared';
import { AppError } from '../lib/errors';

function body(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(body('NOT_FOUND', 'Not found.'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message));
    return;
  }
  // Raised by express.json() for malformed request bodies.
  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json(body('INVALID_JSON', 'The request body is not valid JSON.'));
    return;
  }
  console.error('[error]', err);
  res.status(500).json(body('INTERNAL_ERROR', 'Something went wrong.'));
};
