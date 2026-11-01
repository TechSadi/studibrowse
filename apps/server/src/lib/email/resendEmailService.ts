import type { EmailService } from './emailService';

export const RESEND_API_URL = 'https://api.resend.com/emails';

export interface ResendConfig {
  apiKey: string;
  from: string;
}

// One POST with the built-in fetch, so there's no need for Resend's SDK.
export function createResendEmailService({ apiKey, from }: ResendConfig): EmailService {
  return {
    send: async ({ to, subject, text, html }) => {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });
      if (!res.ok) throw new Error(`Resend rejected the email with status ${res.status}`);
    },
  };
}
