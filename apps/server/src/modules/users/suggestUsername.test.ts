import { describe, expect, it } from 'vitest';
import { USERNAME_MAX, usernameSchema } from '@studibrowse/shared';
import { useTestDatabase } from '../../test/testDb';
import { suggestUsername, usernameBase, withSuffix } from './suggestUsername';
import { User } from './user.model';

useTestDatabase();

describe('usernameBase', () => {
  it.each([
    ['alex.smith@gmail.com', 'alexsmith'],
    ['Alex_Smith+study@gmail.com', 'alex_smithstudy'],
    ['jo@gmail.com', 'jo_'],
    ['élise@gmail.com', 'lise'],
    ['...@gmail.com', 'studier'],
    ['averyveryverylongemailaddress@gmail.com', 'averyveryverylongema'],
  ])('turns %s into %s', (email, expected) => {
    expect(usernameBase(email)).toBe(expected);
    expect(usernameSchema.safeParse(expected).success).toBe(true);
  });
});

describe('withSuffix', () => {
  it('keeps the result within the length limit', () => {
    const name = withSuffix('a'.repeat(USERNAME_MAX), 4);
    expect(name).toHaveLength(USERNAME_MAX);
    expect(name).toMatch(/^a{16}\d{4}$/);
  });
});

describe('suggestUsername', () => {
  it('uses the email local part when it is free', async () => {
    expect(await suggestUsername('alex.smith@gmail.com')).toBe('alexsmith');
  });

  it('adds digits when the base is taken', async () => {
    await User.create({ name: 'Alex', username: 'alexsmith', email: 'other@example.com' });
    const suggestion = await suggestUsername('alex.smith@gmail.com');
    expect(suggestion).toMatch(/^alexsmith\d{3}$/);
    expect(usernameSchema.safeParse(suggestion).success).toBe(true);
  });
});
