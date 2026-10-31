import { z } from 'zod';
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../constants';

/** Stored lowercased, so uniqueness is case-insensitive and @Alex and @alex are the same person. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, `Usernames need at least ${USERNAME_MIN} characters.`)
  .max(USERNAME_MAX, `Usernames can be at most ${USERNAME_MAX} characters.`)
  .regex(/^[a-z0-9_]+$/, 'Use only letters, numbers and underscores.');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email.'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use ${PASSWORD_MIN}+ characters with a number or symbol.`)
  .max(PASSWORD_MAX, `Passwords can be at most ${PASSWORD_MAX} characters.`)
  .regex(/[^A-Za-z]/, `Use ${PASSWORD_MIN}+ characters with a number or symbol.`);

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(NAME_MAX, `Names can be at most ${NAME_MAX} characters.`),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, 'Agree to the terms to continue.'),
  keepLoggedIn: z.boolean().default(true),
});

export const loginSchema = z.object({
  /** An email (contains "@") or a username. */
  identifier: z.string().trim().toLowerCase().min(1, 'Enter your email or username.'),
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX),
  keepLoggedIn: z.boolean().default(false),
});

export const usernameAvailabilityQuerySchema = z.object({ u: usernameSchema });

export type SignupInput = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
