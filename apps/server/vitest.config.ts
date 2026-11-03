import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Starting an in-memory MongoDB can take a while on a cold machine.
    hookTimeout: 60_000,
    // `pnpm test:coverage` measures the feature modules and the real-time layer, the two places with
    // the most logic. Bootstrap (index.ts), config and test helpers are left out on purpose.
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/realtime/**'],
      exclude: ['**/*.test.ts', 'src/test/**', '**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html'],
      // The floor is 80%. These sit just under the measured level so a drop in coverage fails CI.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 85 },
    },
    // Valid values so modules that import config/env.ts can load under test.
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/studibrowse-test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      // The minimum cost, so hashing doesn't dominate the auth tests.
      BCRYPT_COST: '4',
    },
  },
});
