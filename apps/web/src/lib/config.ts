// The only place the web app reads build-time env vars. Vite exposes only VITE_* variables from the root .env.
export const config = {
  /** Google OAuth client id for Google Identity Services. Empty means Google sign-in is unavailable. */
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '',
  /**
   * Where Socket.IO connects. Empty means this page's origin (the Vite proxy in dev). In production it's the
   * Render API origin: REST goes through Vercel's /api rewrite, but Vercel can't proxy WebSockets.
   */
  socketUrl: (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim() ?? '',
};
