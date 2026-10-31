import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Starting an in-memory MongoDB can take a while on a cold machine.
    hookTimeout: 60_000,
    // Valid values so modules that import config/env.ts can load under test.
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/studibrowse-test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    },
  },
});
