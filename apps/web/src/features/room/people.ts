import type { MemberStatus, PresenceMember } from '@studibrowse/shared';

export const STATUS_LABELS: Record<MemberStatus, string> = {
  focusing: 'Focusing',
  break: 'Break',
  away: 'Away',
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Focusing · 23 min", "On a break", "Away" (the mockup's status line under each person). */
export function statusLine(member: PresenceMember, now: number): string {
  if (member.status === 'break') return 'On a break';
  if (member.status === 'away') return 'Away';
  if (!member.focusingSince) return 'Focusing';
  const mins = Math.max(0, Math.floor((now - Date.parse(member.focusingSince)) / 60_000));
  return `Focusing · ${mins} min`;
}

/** "3 focusing · 1 on break · 0 away". */
export function statusSummary(members: PresenceMember[]): string {
  const count = (status: MemberStatus) => members.filter((member) => member.status === status).length;
  return `${count('focusing')} focusing · ${count('break')} on break · ${count('away')} away`;
}
