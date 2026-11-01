import { describe, expect, it } from 'vitest';
import { splitLinks } from './linkify';

const link = (text: string, href = text) => ({ type: 'link', text, href });
const text = (value: string) => ({ type: 'text', text: value });

describe('splitLinks', () => {
  it('leaves plain text alone', () => {
    expect(splitLinks('Going for 4 rounds tonight.')).toEqual([text('Going for 4 rounds tonight.')]);
    expect(splitLinks('')).toEqual([]);
  });

  it('finds http and https links inside other text', () => {
    expect(splitLinks('Notes: https://example.com/a?b=1#c and http://x.org')).toEqual([
      text('Notes: '),
      link('https://example.com/a?b=1#c'),
      text(' and '),
      link('http://x.org'),
    ]);
  });

  it('turns a bare www. address into an https link', () => {
    expect(splitLinks('see www.khanacademy.org')).toEqual([
      text('see '),
      link('www.khanacademy.org', 'https://www.khanacademy.org'),
    ]);
  });

  it('leaves trailing punctuation out of the link', () => {
    expect(splitLinks('Try https://example.com/a.')).toEqual([
      text('Try '),
      link('https://example.com/a'),
      text('.'),
    ]);
    expect(splitLinks('https://example.com?!')).toEqual([link('https://example.com'), text('?!')]);
  });

  it('keeps balanced parentheses and drops a closing one that wraps the link', () => {
    expect(splitLinks('https://en.wikipedia.org/wiki/Set_(mathematics)')).toEqual([
      link('https://en.wikipedia.org/wiki/Set_(mathematics)'),
    ]);
    expect(splitLinks('(https://example.com/a)')).toEqual([
      text('('),
      link('https://example.com/a'),
      text(')'),
    ]);
  });

  it('never links other schemes', () => {
    for (const unsafe of [
      'javascript:alert(1)',
      'JavaScript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'mailto:a@b.c',
    ]) {
      expect(splitLinks(unsafe)).toEqual([text(unsafe)]);
    }
  });

  it('keeps HTML out of the link', () => {
    expect(splitLinks('https://example.com"><script>')).toEqual([
      link('https://example.com'),
      text('"><script>'),
    ]);
  });

  it('skips matches that are not real URLs', () => {
    expect(splitLinks('https://')).toEqual([text('https://')]);
  });
});
