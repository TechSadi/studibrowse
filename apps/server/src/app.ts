import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { createEmailService, type EmailService } from './lib/email';
import { createStorageService, type StorageService } from './lib/storage';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createGoogleVerifier, type GoogleVerifier } from './modules/auth/google';
import { createHealthRouter } from './modules/health/health.routes';
import { createRoomsRouter } from './modules/rooms/rooms.routes';
import { createSessionsRouter } from './modules/sessions/sessions.routes';
import { createUsersRouter } from './modules/users/users.routes';

/** The API only takes small JSON bodies. Files go straight from the browser to storage, never through here. */
export const JSON_BODY_LIMIT = '100kb';

export interface AppDependencies {
  isDatabaseConnected: () => boolean;
  clientOrigin: string;
  /** Defaults to Resend in production and the server log otherwise. Tests pass a fake. */
  emailService?: EmailService;
  /** Defaults to google-auth-library with GOOGLE_CLIENT_ID. Tests pass a fake. */
  verifyGoogleToken?: GoogleVerifier;
  /** Defaults to Cloudinary when configured (uploads off otherwise). Tests pass a fake. */
  storage?: StorageService;
}

/** Builds the Express app without listening, so tests can import it. */
export function createApp({
  isDatabaseConnected,
  clientOrigin,
  emailService = createEmailService(env),
  verifyGoogleToken = createGoogleVerifier(env.GOOGLE_CLIENT_ID),
  storage = createStorageService(env),
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(helmet());
  // credentials: the refresh token travels in a cookie.
  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/api/health', createHealthRouter(isDatabaseConnected));
  // The password, email and Google endpoints are rate limited inside the router.
  app.use('/api/auth', createAuthRouter({ emailService, verifyGoogleToken }));
  app.use('/api/users', createUsersRouter());
  app.use('/api/rooms', createRoomsRouter({ storage }));
  app.use('/api/sessions', createSessionsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
