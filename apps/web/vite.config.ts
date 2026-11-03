/// <reference types="vitest/config" />
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const SERVER_URL = 'http://localhost:4000';
// The repo-root .env, shared with the server.
const ENV_DIR = '../..';

export default defineConfig(({ mode }) => {
  // Every variable from the root .env and the process (CI, Vercel). Only VITE_* ones reach the browser.
  const env = loadEnv(mode, ENV_DIR, '');
  // The Google client id is public (it appears in every Google sign-in page), so reuse the server's
  // GOOGLE_CLIENT_ID instead of asking for a second copy.
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '';
  // The deployed commit: set by the deploy workflow, else by Vercel when it builds from git.
  const release = env.SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || '';
  // Source maps are only built to be uploaded to Sentry, and deleted from dist afterwards, so they're never served.
  const uploadSourceMaps = Boolean(env.SENTRY_AUTH_TOKEN);

  return {
    plugins: [
      react(),
      uploadSourceMaps &&
        sentryVitePlugin({
          org: env.SENTRY_ORG,
          project: env.SENTRY_PROJECT,
          authToken: env.SENTRY_AUTH_TOKEN,
          release: { name: release || undefined },
          sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          telemetry: false,
        }),
    ],
    envDir: ENV_DIR,
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release),
    },
    build: {
      sourcemap: uploadSourceMaps ? 'hidden' : false,
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': SERVER_URL,
        '/socket.io': { target: SERVER_URL, ws: true },
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
