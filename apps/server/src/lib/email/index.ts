import type { Env } from '../../config/env';
import { createConsoleEmailService } from './consoleEmailService';
import type { EmailService } from './emailService';
import { createResendEmailService } from './resendEmailService';

export type { EmailMessage, EmailService } from './emailService';

export function createEmailService(
  env: Pick<Env, 'NODE_ENV' | 'RESEND_API_KEY' | 'EMAIL_FROM'>,
): EmailService {
  // env.ts already requires both values in production; the check keeps the types honest.
  if (env.NODE_ENV === 'production' && env.RESEND_API_KEY && env.EMAIL_FROM) {
    return createResendEmailService({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  return createConsoleEmailService();
}
