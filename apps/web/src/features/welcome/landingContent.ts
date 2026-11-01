import type { AvatarTone } from '../../components/ui/Avatar';
import type { IconName } from '../../components/ui/Icon';

// TODO(stats): these figures are the mockup's static copy. Replace them with live counts once a public stats
// endpoint exists. They are shared by Welcome and the auth screens' art panel.
export const LIVE_STATS = { peopleStudying: 47, liveRooms: 12 };

export const PROOF_AVATARS: { initials: string; tone: AvatarTone }[] = [
  { initials: 'MK', tone: 2 },
  { initials: 'JD', tone: 1 },
  { initials: 'RL', tone: 3 },
  { initials: 'AT', tone: 6 },
];

export const STEPS = [
  { title: 'Open a room', text: "Name it, set the timer and a few room goals. You're the host." },
  {
    title: 'Share the link',
    text: 'Send it to classmates, or keep it public so anyone online can join. Up to 20 people.',
  },
  {
    title: 'Focus together',
    text: 'One shared timer for everyone. Chat in the breaks, share notes and links.',
  },
];

export const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'reset',
    title: 'A shared Pomodoro timer',
    text: 'The host sets focus and break lengths and rounds. Everyone sees the same clock, live.',
  },
  {
    icon: 'users',
    title: "See who's studying",
    text: "Live list of people in the room, what they're working on, and who's on a break.",
  },
  {
    icon: 'chat',
    title: 'Chat and share resources',
    text: 'Text chat, plus a shared shelf for PDFs and links, so nothing gets lost.',
  },
  {
    icon: 'target',
    title: 'Room goals',
    text: 'Agree on what the room should finish tonight, and tick goals off together.',
  },
  {
    icon: 'bell',
    title: 'Follow your study people',
    text: 'Get notified when someone you follow opens a room, so you never miss a session.',
  },
  {
    icon: 'chart',
    title: 'Track your progress',
    text: 'Every round you finish is logged, with a weekly goal and a streak to keep.',
  },
];
