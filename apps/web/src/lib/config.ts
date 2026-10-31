// The only place the web app reads build-time env vars. Vite exposes only VITE_* variables from the root .env.
export const config = {
  /** Google OAuth client id for Google Identity Services. Empty means Google sign-in is unavailable. */
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '',
};
