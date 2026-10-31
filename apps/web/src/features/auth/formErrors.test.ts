import { describe, expect, it } from 'vitest';
import { signupSchema } from '@studibrowse/shared';
import { ApiError } from '../../lib/api';
import { GENERIC_ERROR, issuesToFieldErrors, serverError } from './formErrors';

describe('issuesToFieldErrors', () => {
  it('maps the first shared-schema message to each field', () => {
    const result = signupSchema.safeParse({
      name: '',
      username: 'a',
      email: 'nope',
      password: 'short',
      acceptTerms: false,
    });
    expect(result.success).toBe(false);
    const errors = issuesToFieldErrors(result.error?.issues ?? []);
    expect(errors).toEqual({
      name: 'Enter your name.',
      username: 'Usernames need at least 3 characters.',
      email: 'Enter a valid email.',
      password: 'Use 8+ characters with a number or symbol.',
      acceptTerms: 'Agree to the terms to continue.',
    });
  });
});

describe('serverError', () => {
  const fields = { EMAIL_TAKEN: 'email', USERNAME_TAKEN: 'username' } as const;

  it('puts known codes on their field', () => {
    const err = new ApiError(409, 'USERNAME_TAKEN', '@maya is taken.');
    expect(serverError(err, fields)).toEqual({ field: 'username', message: '@maya is taken.' });
  });

  it('shows other server errors at form level', () => {
    const err = new ApiError(429, 'RATE_LIMITED', 'Too many attempts.');
    expect(serverError(err, fields)).toEqual({ message: 'Too many attempts.' });
  });

  it('never shows raw unexpected errors', () => {
    expect(serverError(new Error('stack trace here'), fields)).toEqual({ message: GENERIC_ERROR });
  });
});
