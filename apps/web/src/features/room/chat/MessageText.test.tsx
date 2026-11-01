import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageText } from './MessageText';

afterEach(cleanup);

describe('MessageText', () => {
  it('shows HTML as text instead of running it', () => {
    const hostile = '<script>alert(1)</script><img src=x onerror="alert(2)"><b>bold</b>';
    const { container } = render(
      <p>
        <MessageText text={hostile} />
      </p>,
    );

    expect(container.querySelector('script, img, b')).toBeNull();
    expect(container.textContent).toBe(hostile);
  });

  it('opens links in a new tab without giving the page access to this one', () => {
    render(<MessageText text="Playlist: https://example.com/list and more" />);

    const link = screen.getByRole('link', { name: 'https://example.com/list' });
    expect(link.getAttribute('href')).toBe('https://example.com/list');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('does not make javascript: links', () => {
    render(<MessageText text="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
