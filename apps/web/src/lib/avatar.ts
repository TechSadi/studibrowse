import { AVATAR_COLORS, type AvatarColor } from '@studibrowse/shared';
import type { AvatarTone } from '../components/ui/Avatar';

export { initialsOf } from '@studibrowse/shared';

/** AVATAR_COLORS is in the same order as the --av1..--av6 tokens. */
export function avatarTone(color: AvatarColor): AvatarTone {
  return (AVATAR_COLORS.indexOf(color) + 1 || 1) as AvatarTone;
}
