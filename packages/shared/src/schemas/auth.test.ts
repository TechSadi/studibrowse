import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  passwordSchema,
  resetPasswordSchema,
  signupSchema,
  usernameSchema,
} from './auth';

const validSignup = {
  name: 'Alex Smith',
  username: 'alexsmith',
  email: 'alex@example.com',
  password: 'hunter2hunter',
  acceptTerms: true,
};

describe('usernameSchema', () => {
  it('trims and lowercases', () => {
    expect(usernameSchema.parse('  Alex_Smith1 ')).toBe('alex_smith1');
  });

  it.each(['ab', 'a'.repeat(21), 'alex smith', 'alex-smith', 'élise'])('rejects %j', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse(' Alex@Example.COM ')).toBe('alex@example.com');
  });

  it('rejects an invalid email', () => {
    expect(emailSchema.safeParse('alex@').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts 8+ characters with a number or symbol', () => {
    expect(passwordSchema.safeParse('password1').success).toBe(true);
    expect(passwordSchema.safeParse('pass word').success).toBe(true);
  });

  it.each(['short1!', 'onlyletters', 'a1'.repeat(37)])('rejects %j', (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});

describe('signupSchema', () => {
  it('defaults keepLoggedIn to true', () => {
    expect(signupSchema.parse(validSignup).keepLoggedIn).toBe(true);
  });

  it('requires the terms to be accepted', () => {
    expect(signupSchema.safeParse({ ...validSignup, acceptTerms: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, acceptTerms: undefined }).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(signupSchema.safeParse({ ...validSignup, name: '   ' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('lowercases the identifier and defaults keepLoggedIn to false', () => {
    expect(loginSchema.parse({ identifier: ' AlexSmith ', password: 'x' })).toEqual({
      identifier: 'alexsmith',
      password: 'x',
      keepLoggedIn: false,
    });
  });

  it('requires a password', () => {
    expect(loginSchema.safeParse({ identifier: 'alex', password: '' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('normalises the email', () => {
    expect(forgotPasswordSchema.parse({ email: ' Alex@Example.COM ' })).toEqual({
      email: 'alex@example.com',
    });
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'alex' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a token and a strong password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'password1' }).success).toBe(true);
  });

  it.each([
    ['an empty token', { token: '', password: 'password1' }],
    ['an overlong token', { token: 'x'.repeat(129), password: 'password1' }],
    ['a weak password', { token: 'abc', password: 'onlyletters' }],
  ])('rejects %s', (_label, value) => {
    expect(resetPasswordSchema.safeParse(value).success).toBe(false);
  });
});

describe('googleAuthSchema', () => {
  it('defaults keepLoggedIn to true', () => {
    expect(googleAuthSchema.parse({ credential: 'id-token' })).toEqual({
      credential: 'id-token',
      keepLoggedIn: true,
    });
  });

  it('requires a credential', () => {
    expect(googleAuthSchema.safeParse({ credential: '' }).success).toBe(false);
    expect(googleAuthSchema.safeParse({}).success).toBe(false);
  });
});
