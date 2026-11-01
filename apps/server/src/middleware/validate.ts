import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

/** The message for the first issue. Shared by the REST validators and the socket handler wrapper. */
export function validationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The request is not valid.';
  // Our own messages read as sentences; zod's generic type errors need the field name to make sense.
  return issue.code === 'invalid_type' && issue.path.length > 0
    ? `${issue.path.join('.')}: ${issue.message}`
    : issue.message;
}

function validationError(error: z.ZodError): AppError {
  return new AppError(400, 'VALIDATION_ERROR', validationMessage(error));
}

/** Replaces req.body with the parsed (trimmed, normalised, defaulted) value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) throw validationError(result.error);
    req.body = result.data;
    next();
  };
}

/** Replaces req.query with the parsed value. Express 5 makes req.query a getter, so it is redefined. */
export function validateQuery(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) throw validationError(result.error);
    Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    next();
  };
}

/** Replaces req.params with the parsed value. */
export function validateParams(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) throw validationError(result.error);
    req.params = result.data as typeof req.params;
    next();
  };
}
