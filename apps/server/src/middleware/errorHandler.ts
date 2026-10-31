import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, errorBody } from '../lib/errors';
import { logger } from '../lib/logger';

/** Shape of the errors express.json() raises (http-errors with a `type`). */
function bodyParserErrorType(err: unknown): string | undefined {
  if (err instanceof Error && 'type' in err && typeof err.type === 'string') return err.type;
  return undefined;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Not found.'));
};

/**
 * The only place error responses are written. Only AppError messages reach the client;
 * everything else is logged with its stack and answered with a generic 500, in every environment.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Too late to send a JSON body; let Express close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  const parserError = bodyParserErrorType(err);
  if (parserError === 'entity.parse.failed') {
    res.status(400).json(errorBody('INVALID_JSON', 'The request body is not valid JSON.'));
    return;
  }
  if (parserError === 'entity.too.large') {
    res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'The request body is too large.'));
    return;
  }
  logger.error({ err, reqId: req.id, method: req.method, url: req.originalUrl }, 'unhandled error');
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Something went wrong.'));
};
