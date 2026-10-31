import { RESET_TOKEN_TTL_MINS } from '@studibrowse/shared';
import type { EmailMessage } from '../../lib/email';

/**
 * The token goes in the URL fragment, which browsers never send to a server, so it can't end up
 * in access logs or Referer headers. The web app's reset page reads it from location.hash.
 */
export function resetPasswordUrl(clientOrigin: string, token: string): string {
  const url = new URL('/reset-password', clientOrigin);
  url.hash = `token=${token}`;
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function passwordResetEmail(to: string, name: string, resetUrl: string): EmailMessage {
  const text = [
    `Hi ${name},`,
    '',
    'Someone asked to reset the password for your StudiBrowse account. Open this link to choose a new one:',
    '',
    resetUrl,
    '',
    `The link works once and expires in ${RESET_TOKEN_TTL_MINS} minutes.`,
    "If you didn't ask for this, ignore this email. Your password won't change.",
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    '<p>Someone asked to reset the password for your StudiBrowse account.</p>',
    `<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>`,
    `<p>The link works once and expires in ${RESET_TOKEN_TTL_MINS} minutes.</p>`,
    "<p>If you didn't ask for this, ignore this email. Your password won't change.</p>",
  ].join('\n');
  return { to, subject: 'Reset your StudiBrowse password', text, html };
}
