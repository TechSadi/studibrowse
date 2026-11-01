import { logger } from '../logger';
import type { EmailService } from './emailService';

/** Development stand-in: prints the email (including any links) to the server log instead of sending it. */
export function createConsoleEmailService(): EmailService {
  return {
    send: async ({ to, subject, text }) => {
      logger.info({ to, subject }, `[email] not sent outside production:\n${text}`);
    },
  };
}
