import { nanoid } from 'nanoid';
import { INVITE_CODE_LENGTH } from '@studibrowse/shared';

/** A short, random, unguessable invite code (nanoid uses a cryptographic random source). */
export function generateInviteCode(): string {
  return nanoid(INVITE_CODE_LENGTH);
}
