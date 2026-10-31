import { describe, expect, it } from 'vitest';
import { loginPathFor, resolveSignedInPath, safeNextPath } from './redirects';

const onboarded = { onboardedAt: '2026-10-01T10:00:00.000Z' };
const fresh = { onboardedAt: null };

describe('resolveSignedInPath', () => {
  it('sends users who have not finished onboarding to onboarding', () => {
    expect(resolveSignedInPath(fresh)).toBe('/onboarding');
  });

  it('keeps a safe next path through onboarding', () => {
    expect(resolveSignedInPath(fresh, '/r/abc123')).toBe('/onboarding?next=%2Fr%2Fabc123');
  });

  it('sends onboarded users to next, or Home', () => {
    expect(resolveSignedInPath(onboarded)).toBe('/home');
    expect(resolveSignedInPath(onboarded, '/progress?week=2')).toBe('/progress?week=2');
  });
});

describe('safeNextPath', () => {
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'home', '', null, undefined])(
    'rejects %s',
    (next) => {
      expect(safeNextPath(next)).toBeNull();
    },
  );

  it('rejects public-only pages, which would redirect again', () => {
    expect(safeNextPath('/login')).toBeNull();
    expect(safeNextPath('/?x=1')).toBeNull();
  });

  it('accepts same-site paths', () => {
    expect(safeNextPath('/settings#appearance')).toBe('/settings#appearance');
  });
});

describe('loginPathFor', () => {
  it('carries the current page as next', () => {
    expect(loginPathFor({ pathname: '/home', search: '?tab=live' })).toBe('/login?next=%2Fhome%3Ftab%3Dlive');
  });
});
