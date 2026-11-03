import { z } from 'zod';
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../constants';

/** The longest an email can be (RFC 5321), so the longest identifier a login can need. */
const IDENTIFIER_MAX = 254;

/** Stored lowercased, so uniqueness is case-insensitive and @Alex and @alex are the same person. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, `Usernames need at least ${USERNAME_MIN} characters.`)
  .max(USERNAME_MAX, `Usernames can be at most ${USERNAME_MAX} characters.`)
  .regex(/^[a-z0-9_]+$/, 'Use only letters, numbers and underscores.');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name.')
  .max(NAME_MAX, `Names can be at most ${NAME_MAX} characters.`);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email.'));

/**
 * UTF-8 length. bcrypt counts bytes, and an accented letter or emoji takes 2 to 4. Counted by hand because
 * this package runs in Node and the browser and doesn't assume TextEncoder's types.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use ${PASSWORD_MIN}+ characters with a number or symbol.`)
  .max(PASSWORD_MAX, `Passwords can be at most ${PASSWORD_MAX} characters.`)
  .regex(/[^A-Za-z]/, `Use ${PASSWORD_MIN}+ characters with a number or symbol.`)
  // Past 72 bytes bcrypt silently ignores the rest, so the tail of a long non-ASCII password wouldn't count.
  .refine(
    (password) => utf8ByteLength(password) <= PASSWORD_MAX,
    'That password is too long. Try a shorter one.',
  );

export const signupSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, 'Agree to the terms to continue.'),
  keepLoggedIn: z.boolean().default(true),
});

export const loginSchema = z.object({
  /** An email (contains "@") or a username. */
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your email or username.')
    .max(IDENTIFIER_MAX, 'Enter your email or username.'),
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX),
  keepLoggedIn: z.boolean().default(false),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  /** The raw token from the reset link. */
  token: z.string().min(1, 'This reset link is invalid or has expired.').max(128),
  password: passwordSchema,
});

export const googleAuthSchema = z.object({
  /** The ID token (JWT) that Google Identity Services hands the client. */
  credential: z.string().min(1, 'Google sign-in failed. Please try again.').max(4096),
  keepLoggedIn: z.boolean().default(true),
});

export const usernameAvailabilityQuerySchema = z.object({ u: usernameSchema });

export type SignupInput = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordData = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ResetPasswordData = z.output<typeof resetPasswordSchema>;
export type GoogleAuthInput = z.input<typeof googleAuthSchema>;
export type GoogleAuthData = z.output<typeof googleAuthSchema>;
