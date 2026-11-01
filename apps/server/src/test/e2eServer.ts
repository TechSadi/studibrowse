import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Runs the real server for the Playwright tests in `/e2e`: a throwaway in-memory MongoDB and fixed test
 * settings, so the suite never touches the dev database and doesn't depend on anyone's .env.
 * The server runs as a child process so it validates this config through env.ts like any other boot.
 */
const SERVER_DIR = fileURLToPath(new URL('../..', import.meta.url));

const mongo = await MongoMemoryServer.create();

const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: SERVER_DIR,
  stdio: 'inherit',
  env: {
    // PATH and friends, which the child needs to start at all on Windows.
    ...process.env,
    NODE_ENV: 'test',
    PORT: '4000',
    MONGODB_URI: mongo.getUri('studibrowse-e2e'),
    CLIENT_ORIGIN: 'http://localhost:5173',
    JWT_ACCESS_SECRET: 'e2e-only-secret-not-used-anywhere-real-0123456789',
    BCRYPT_COST: '4',
    LOG_LEVEL: 'warn',
  },
});

server.on('exit', (code) => {
  void mongo.stop().finally(() => process.exit(code ?? 0));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal));
}
