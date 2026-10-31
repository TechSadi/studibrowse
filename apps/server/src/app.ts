import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createHealthRouter } from './modules/health/health.routes';
import { createUsersRouter } from './modules/users/users.routes';

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
  // credentials: the refresh token travels in a cookie.
  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/api/health', createHealthRouter(isDatabaseConnected));
  // Signup and login are rate limited inside the router.
  app.use('/api/auth', createAuthRouter());
  app.use('/api/users', createUsersRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
