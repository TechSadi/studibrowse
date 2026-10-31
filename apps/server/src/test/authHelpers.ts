import type { Response } from 'supertest';
import type { EmailMessage, EmailService } from '../lib/email';
import { REFRESH_COOKIE } from '../modules/auth/auth.cookies';

export function setCookieHeaders(res: Response): string[] {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

/** The full Set-Cookie line for the refresh cookie. */
export function refreshSetCookie(res: Response): string {
  const line = setCookieHeaders(res).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!line) throw new Error('No refresh cookie was set');
  return line;
}

/** `sb_refresh=<token>`, ready to send back in a Cookie header. Supertest won't resend Secure cookies over http. */
export function refreshCookie(res: Response): string {
  return refreshSetCookie(res).split(';')[0]!;
}

/** An EmailService that keeps what it was asked to send. */
export function createRecordingEmailService(): EmailService & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
    },
  };
}
