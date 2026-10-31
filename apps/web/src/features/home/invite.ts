// The server makes invite codes once room creation lands; until then accept any URL-safe code.
const CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Reads what someone pasted into the join box: a full invite URL (`https://…/r/<code>`), a path
 * (`/r/<code>`) or the bare code. Returns the code, or null if it isn't one.
 */
export function parseInviteInput(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromPath = /(?:^|\/)r\/([^/?#\s]+)\/?(?:[?#].*)?$/.exec(text)?.[1];
  const code = fromPath ?? text;
  return CODE_PATTERN.test(code) ? code : null;
}
