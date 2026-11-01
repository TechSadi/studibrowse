import { INVITE_CODE_PATTERN } from '@studibrowse/shared';

/**
 * Reads what someone pasted into the join box: a full invite URL (`https://…/r/<code>`), a path
 * (`/r/<code>`) or the bare code. Returns the code, or null if it isn't one.
 */
export function parseInviteInput(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromPath = /(?:^|\/)r\/([^/?#\s]+)\/?(?:[?#].*)?$/.exec(text)?.[1];
  const code = fromPath ?? text;
  return INVITE_CODE_PATTERN.test(code) ? code : null;
}
