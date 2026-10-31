import { AVATAR_COLORS, type AvatarColor } from '@studibrowse/shared';
import type { AvatarTone } from '../components/ui/Avatar';

/** "Alex Smith" → "AS", "maya" → "MA". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** AVATAR_COLORS is in the same order as the --av1..--av6 tokens. */
export function avatarTone(color: AvatarColor): AvatarTone {
  return (AVATAR_COLORS.indexOf(color) + 1 || 1) as AvatarTone;
}
