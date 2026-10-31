import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createAuthRateLimiter } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { createHealthRouter } from './modules/health/health.routes';

/** The API only takes small JSON bodies; file uploads will use their own multipart route. */
export const JSON_BODY_LIMIT = '100kb';

export interface AppDependencies {
  isDatabaseConnected: () => boolean;
  clientOrigin: string;
}

/** Builds the Express app without listening, so tests can import it. */
export function createApp({ isDatabaseConnected, clientOrigin }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api/health', createHealthRouter(isDatabaseConnected));
  // Mounted before the auth routes exist so the limit can't be forgotten when they land.
  app.use('/api/auth', createAuthRateLimiter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
