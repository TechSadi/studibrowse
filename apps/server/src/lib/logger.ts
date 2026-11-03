import { pino } from 'pino';
import { env } from '../config/env';
import { captureError } from './monitoring';

const ERROR_LEVEL = 50;

/**
 * Every log at error level or above that carries an `err` is an unexpected failure (handled errors are answers,
 * not logs), so it goes to error tracking too, with the log's other fields and message as context. That covers
 * the REST error handler, the socket wrapper and background jobs with one rule.
 */
export function reportLoggedError(args: unknown[], level: number): void {
  if (level < ERROR_LEVEL) return;
  const [fields, message] = args;
  if (typeof fields !== 'object' || fields === null || !('err' in fields)) return;
  const { err, ...context } = fields as { err: unknown } & Record<string, unknown>;
  captureError(err, typeof message === 'string' ? { ...context, message } : context);
}

export const logger = pino({
  level: env.LOG_LEVEL,
  // On every line, so logs from several deploys or services can be told apart.
  base: { service: 'studibrowse-api', env: env.NODE_ENV, release: env.release },
  timestamp: pino.stdTimeFunctions.isoTime,
  // "level":"error" instead of 50, so log search can filter on it.
  formatters: { level: (label) => ({ level: label }) },
  hooks: {
    logMethod(args, method, level) {
      reportLoggedError(args, level);
      method.apply(this, args);
    },
  },
  // Never write credentials to the logs.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  // Readable logs locally; plain JSON lines everywhere else so log tooling can parse them.
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service,env,release' },
    },
  }),
});
