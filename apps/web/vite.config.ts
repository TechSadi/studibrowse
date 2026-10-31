/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_URL = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
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
});
