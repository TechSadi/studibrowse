import { OAuth2Client } from 'google-auth-library';
import { googleNotConfigured, googleTokenInvalid } from './auth.errors';

/** What sign-in needs from a verified Google ID token. */
export interface GoogleProfile {
  /** Google's stable account id. Emails can change; this can't. */
  sub: string;
  email: string;
  name: string | undefined;
}

/** Verifies an ID token from Google Identity Services, or throws GOOGLE_TOKEN_INVALID. */
export type GoogleVerifier = (idToken: string) => Promise<GoogleProfile>;

export function createGoogleVerifier(clientId: string | undefined): GoogleVerifier {
  if (!clientId) {
    return async () => {
      throw googleNotConfigured();
    };
  }
  const client = new OAuth2Client({ clientId });

  return async (idToken) => {
    let payload;
    try {
      // Checks the signature against Google's keys, the issuer, the expiry and that it was issued for our client.
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw googleTokenInvalid();
    }
    // We link accounts by email, so it has to be one Google has verified belongs to this person.
    if (!payload?.sub || !payload.email || payload.email_verified !== true) throw googleTokenInvalid();
    return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name };
  };
}
