export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/**
 * Strength from 0 to 4, exactly as in the mockup: one point each for 8+ characters, 12+ characters, a digit,
 * a symbol, and mixed case, capped at 4. This is guidance only; the shared passwordSchema decides what's allowed.
 */
export function passwordScore(password: string): PasswordScore {
  if (!password) return 0;
  const points = [
    password.length >= 8,
    password.length >= 12,
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
    /[A-Z]/.test(password) && /[a-z]/.test(password),
  ].filter(Boolean).length;
  return Math.min(4, points) as PasswordScore;
}

export const PASSWORD_HINT = 'Use 8+ characters with a number or symbol.';

export function passwordHint(password: string): { text: string; ok: boolean } {
  if (!password) return { text: PASSWORD_HINT, ok: false };
  const score = passwordScore(password);
  if (score >= 3) return { text: 'Strong password.', ok: true };
  if (score === 2) return { text: 'Okay. A symbol or more length makes it stronger.', ok: false };
  return { text: 'Too weak. Add more characters, numbers or symbols.', ok: false };
}
