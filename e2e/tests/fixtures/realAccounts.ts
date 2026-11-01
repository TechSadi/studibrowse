import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { AuthResponse } from '@studibrowse/shared';

/** Someone signed in to the real server, in a browser context of their own. */
export interface Person {
  name: string;
  firstName: string;
  context: BrowserContext;
  page: Page;
}

/**
 * Signs a new, onboarded account up against the real server (no page.route stubs) in a fresh browser context.
 * The refresh cookie lands in the context, so the app signs in by itself on the first page load.
 */
export async function signUpPerson(browser: Browser, baseURL: string, name: string): Promise<Person> {
  const context = await browser.newContext({ baseURL });
  const firstName = name.split(' ')[0] ?? name;
  // Unique per run, so the test also works against a reused dev server and database.
  const username = `${firstName.toLowerCase()}_${Math.random().toString(36).slice(2, 10)}`;

  const signup = await context.request.post('/api/auth/signup', {
    data: { name, username, email: `${username}@example.com`, password: 'e2e-pass-123', acceptTerms: true },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const { accessToken } = (await signup.json()) as AuthResponse;

  const onboard = await context.request.patch('/api/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { onboarded: true },
  });
  expect(onboard.status(), await onboard.text()).toBe(200);

  return { name, firstName, context, page: await context.newPage() };
}
