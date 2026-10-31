import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleVerifier } from './google';

const verifyIdToken = vi.hoisted(() => vi.fn());

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(function () {
    return { verifyIdToken };
  }),
}));

const CLIENT_ID = 'client-id.apps.googleusercontent.com';

function ticketWith(payload: Record<string, unknown> | undefined) {
  return { getPayload: () => payload };
}

beforeEach(() => {
  verifyIdToken.mockReset();
});

describe('createGoogleVerifier', () => {
  it('verifies the token for our client id and returns the profile', async () => {
    verifyIdToken.mockResolvedValue(
      ticketWith({ sub: 'g-1', email: 'Alex@Gmail.com', email_verified: true, name: 'Alex Smith' }),
    );
    const profile = await createGoogleVerifier(CLIENT_ID)('id-token');
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'id-token', audience: CLIENT_ID });
    expect(profile).toEqual({ sub: 'g-1', email: 'alex@gmail.com', name: 'Alex Smith' });
  });

  it('rejects a token Google does not accept', async () => {
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));
    await expect(createGoogleVerifier(CLIENT_ID)('id-token')).rejects.toMatchObject({
      code: 'GOOGLE_TOKEN_INVALID',
    });
  });

  it.each([
    ['an unverified email', { sub: 'g-1', email: 'a@gmail.com', email_verified: false }],
    ['no email', { sub: 'g-1', email_verified: true }],
    ['no subject', { email: 'a@gmail.com', email_verified: true }],
    ['no payload', undefined],
  ])('rejects a token with %s', async (_label, payload) => {
    verifyIdToken.mockResolvedValue(ticketWith(payload));
    await expect(createGoogleVerifier(CLIENT_ID)('id-token')).rejects.toMatchObject({
      code: 'GOOGLE_TOKEN_INVALID',
    });
  });

  it('answers 503 GOOGLE_NOT_CONFIGURED without a client id', async () => {
    await expect(createGoogleVerifier(undefined)('id-token')).rejects.toMatchObject({
      status: 503,
      code: 'GOOGLE_NOT_CONFIGURED',
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
