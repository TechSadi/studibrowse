import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { WelcomePage } from './WelcomePage';

function renderPage() {
  return render(
    <MemoryRouter>
      <WelcomePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('WelcomePage', () => {
  it('shows the hero with sign-up and log-in calls to action', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Study with people, not alone.' })).toBeDefined();

    const signupLinks = screen.getAllByRole('link', { name: /Create your free account/ });
    expect(signupLinks).toHaveLength(2); // hero and final call to action
    for (const link of signupLinks) expect(link.getAttribute('href')).toBe('/signup');
    expect(screen.getByRole('link', { name: 'I already have one' }).getAttribute('href')).toBe('/login');
  });

  it('links the nav to the page sections', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how');
    expect(within(nav).getByRole('link', { name: 'Features' }).getAttribute('href')).toBe('#features');
  });

  it('lists the three steps and the six features', () => {
    renderPage();
    const how = screen.getByRole('region', { name: 'From alone to focused in a minute.' });
    expect(within(how).getAllByRole('listitem')).toHaveLength(3);
    const features = screen.getByRole('region', { name: 'Everything a good study group needs.' });
    expect(within(features).getAllByRole('heading', { level: 3 })).toHaveLength(6);
  });
});
