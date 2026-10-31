import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const valid = {
  NODE_ENV: 'production',
  PORT: '8080',
  MONGODB_URI: 'mongodb://localhost:27017/studibrowse',
  CLIENT_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'warn',
};

describe('parseEnv', () => {
  it('parses valid values and coerces PORT to a number', () => {
    const result = parseEnv(valid);
    expect(result).toEqual({ ok: true, env: { ...valid, PORT: 8080 } });
  });

  it('defaults NODE_ENV, PORT and LOG_LEVEL', () => {
    const result = parseEnv({ MONGODB_URI: valid.MONGODB_URI, CLIENT_ORIGIN: valid.CLIENT_ORIGIN });
    expect(result.ok && result.env).toMatchObject({ NODE_ENV: 'development', PORT: 4000, LOG_LEVEL: 'info' });
  });

  it('rejects an unknown LOG_LEVEL', () => {
    const result = parseEnv({ ...valid, LOG_LEVEL: 'verbose' });
    expect(result.ok).toBe(false);
  });

  it('names every missing variable', () => {
    const result = parseEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toMatch(/^MONGODB_URI /);
    expect(result.problems[1]).toMatch(/^CLIENT_ORIGIN /);
  });

  it('rejects a MongoDB URI with the wrong scheme', () => {
    const result = parseEnv({ ...valid, MONGODB_URI: 'http://localhost:27017' });
    expect(result.ok).toBe(false);
  });
});
