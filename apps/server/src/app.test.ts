import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, JSON_BODY_LIMIT } from './app';
import { AUTH_RATE_LIMIT } from './middleware/rateLimit';

const CLIENT_ORIGIN = 'http://localhost:5173';

function makeApp() {
  return createApp({ isDatabaseConnected: () => true, clientOrigin: CLIENT_ORIGIN });
}

describe('app security middleware', () => {
  it('sets helmet security headers and hides the framework', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS from the client origin only', async () => {
    const app = makeApp();
    const allowed = await request(app).get('/api/health').set('Origin', CLIENT_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(CLIENT_ORIGIN);

    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it(`rejects JSON bodies over ${JSON_BODY_LIMIT}`, async () => {
    const res = await request(makeApp())
      .post('/api/health')
      .send({ text: 'a'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('tags every response with a request id', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rate limits /api/auth', async () => {
    const app = makeApp();
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
      const res = await request(app).post('/api/auth/login');
      expect(res.status).not.toBe(429);
    }
    const blocked = await request(app).post('/api/auth/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  async function exhaustAuthLimit(app: ReturnType<typeof makeApp>, ip: string) {
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
      await request(app).post('/api/auth/login').set('X-Forwarded-For', ip);
    }
  }

  it('with trustProxy, counts each visitor from X-Forwarded-For instead of the proxy', async () => {
    const app = createApp({ isDatabaseConnected: () => true, clientOrigin: CLIENT_ORIGIN, trustProxy: 1 });
    await exhaustAuthLimit(app, '203.0.113.1');
    const sameVisitor = await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.1');
    expect(sameVisitor.status).toBe(429);
    const otherVisitor = await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.2');
    expect(otherVisitor.status).not.toBe(429);
  });

  it('without trustProxy, ignores X-Forwarded-For so it can’t be spoofed to dodge the limit', async () => {
    const app = createApp({ isDatabaseConnected: () => true, clientOrigin: CLIENT_ORIGIN, trustProxy: 0 });
    await exhaustAuthLimit(app, '203.0.113.1');
    const spoofed = await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.2');
    expect(spoofed.status).toBe(429);
  });

  it('does not rate limit other routes', async () => {
    const app = makeApp();
    for (let i = 0; i <= AUTH_RATE_LIMIT.limit; i++) {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    }
  });
});
