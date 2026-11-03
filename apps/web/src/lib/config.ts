// The only place the web app reads build-time env vars. Vite exposes only VITE_* variables from the root .env.
export const config = {
  /** Google OAuth client id for Google Identity Services. Empty means Google sign-in is unavailable. */
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '',
  /**
   * The API origin, used only by Socket.IO. Empty means this page's origin (the Vite proxy in dev). In production
   * it's the Render origin: REST goes through Vercel's /api rewrite (so the refresh cookie stays first-party), but
   * Vercel can't proxy WebSockets.
   */
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '',
  /** Sentry DSN for the web project. Empty turns error tracking off. A DSN is public; it only allows sending. */
  sentryDsn: (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() ?? '',
  /** The deployed commit, set by vite.config.ts, so events match the uploaded source maps. */
  sentryRelease: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined)?.trim() || undefined,
  /** `production` in builds, `development` under `vite`. */
  mode: import.meta.env.MODE,
};
