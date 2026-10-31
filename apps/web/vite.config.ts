/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const SERVER_URL = 'http://localhost:4000';
// The repo-root .env, shared with the server.
const ENV_DIR = '../..';

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_* variables to the browser. The Google client id is public (it appears in every
  // Google sign-in page), so reuse the server's GOOGLE_CLIENT_ID instead of asking for a second copy.
  const env = loadEnv(mode, ENV_DIR, '');
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '';

  return {
    plugins: [react()],
    envDir: ENV_DIR,
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
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
