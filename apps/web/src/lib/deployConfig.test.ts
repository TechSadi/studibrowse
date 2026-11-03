// @vitest-environment node
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import vercelConfig from '../../vercel.json';

/**
 * vercel.json can't read env vars, so the CSP and the /api rewrite are written out by hand. These checks keep
 * them in step with index.html and with each other.
 */

const headers = vercelConfig.headers.flatMap((rule) => rule.headers);
const csp = headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';

function directive(name: string): string[] {
  const found = csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  return found?.slice(1) ?? [];
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('vercel.json', () => {
  it('allows each inline script in index.html by its hash', async () => {
    const inlineScripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const script of inlineScripts) {
      expect(directive('script-src')).toContain(`'sha256-${await sha256Base64(script)}'`);
    }
  });

  it('never allows inline or eval scripts', () => {
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(directive('script-src')).not.toContain("'unsafe-eval'");
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
  });

  it('sends REST and the socket to the same API origin', () => {
    const apiRewrite = vercelConfig.rewrites.find((rewrite) => rewrite.source === '/api/:path*');
    expect(apiRewrite).toBeDefined();
    const apiOrigin = new URL(apiRewrite!.destination).origin;
    expect(apiOrigin).toMatch(/^https:\/\//);
    expect(directive('connect-src')).toContain(apiOrigin);
    expect(directive('connect-src')).toContain(apiOrigin.replace(/^https:/, 'wss:'));
  });

  it('sets HSTS and nosniff', () => {
    const keys = headers.map((header) => header.key);
    expect(keys).toContain('Strict-Transport-Security');
    expect(keys).toContain('X-Content-Type-Options');
  });
});
