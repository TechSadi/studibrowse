import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createHealthRouter } from './modules/health/health.routes';

export interface AppDependencies {
  isDatabaseConnected: () => boolean;
}

/** Builds the Express app without listening, so tests can import it. */
export function createApp({ isDatabaseConnected }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/health', createHealthRouter(isDatabaseConnected));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
