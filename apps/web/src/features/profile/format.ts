import type { ProfileRecentRoom, RoomSummary } from '@studibrowse/shared';
import { sessionDayLabel } from '../progress/format';
import { phaseView } from '../rooms/timerText';

/** "Joined March 2026". */
export function joinedText(iso: string): string {
  return `Joined ${new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
}

/** "@mayak · Pharmacy, year 3 · Joined March 2026", leaving out an empty studying line. */
export function profileSubtitle(profile: { username: string; studying: string; joinedAt: string }): string {
  return [`@${profile.username}`, profile.studying, joinedText(profile.joinedAt)].filter(Boolean).join(' · ');
}

/** Focus minutes as the profile's stat tile shows them: "42h", or "45m" under an hour. */
export function hoursText(mins: number): string {
  return mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`;
}

/** "14 of 20 studying · focus round 3 of 4 · 18 min left". The time left comes from `endsAt`, never ticked. */
export function hostingDetail(room: RoomSummary, now: number): string {
  const phase = phaseView(room.timer, room.timerSettings, now);
  // "Focus round · 3 of 4" reads as "focus round 3 of 4" mid-sentence.
  const title = (phase.tone === 'focus' ? phase.title.replace(' · ', ' ') : phase.title).replace(/^./, (c) =>
    c.toLowerCase(),
  );
  return `${room.memberCount} of ${room.maxSize} studying · ${title} · ${phase.detail}`;
}

/** "Today · hosting · 14 people", "Thu 29 Oct · joined Alex · 12 people". */
export function recentRoomMeta(room: ProfileRecentRoom, now: Date): string {
  const when = room.inProgress ? 'Today' : sessionDayLabel(room.startedAt, now);
  let role: string;
  if (room.role === 'hosted') role = room.inProgress ? 'hosting' : 'hosted';
  else role = room.hostName ? `joined ${room.hostName}` : 'joined';
  const people = room.people === 1 ? 'just them' : `${room.people} people`;
  return `${when} · ${role} · ${people}`;
}

/** "Maya Kapoor" → "Maya". */
export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** "You and Maya studied together in 6 rooms." or null when there's nothing to say. */
export function togetherText(name: string, rooms: number | null): string | null {
  if (!rooms) return null;
  return `You and ${firstName(name)} studied together in ${rooms} room${rooms === 1 ? '' : 's'}.`;
}
