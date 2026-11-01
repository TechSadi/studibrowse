import { describe, expect, it } from 'vitest';
import { typingText } from './typingText';

describe('typingText', () => {
  it('is empty when nobody is typing', () => {
    expect(typingText([])).toBe('');
  });

  it('names one or two people', () => {
    expect(typingText(['Hana'])).toBe('Hana is typing…');
    expect(typingText(['Hana', 'Riley'])).toBe('Hana and Riley are typing…');
  });

  it('stops naming people after two', () => {
    expect(typingText(['Hana', 'Riley', 'Maya'])).toBe('Several people are typing…');
  });
});
