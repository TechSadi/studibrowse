import { Link } from 'react-router';
import type { RoomSummary } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useNow } from '../../hooks/useNow';
import { firstName } from '../room/people';
import { phaseView } from '../rooms/timerText';
import styles from './Home.module.css';
import { ALL_ROOMS, pickHappeningNow } from './roomList';
import { useLiveRooms } from './useLiveRooms';

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const pad = (n: number) => String(n).padStart(2, '0');

/** Moves focus (and the view) to Rooms worth joining. */
function goToLiveRooms() {
  document.getElementById('live-heading')?.focus();
}

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className={styles.heroCopy}>
        <h2 id="hero-heading">Study with people, not alone.</h2>
        <p>
          Open a room, share the link, and focus together on one shared timer. Everyone can work on something
          different.
        </p>
        <div className={styles.heroFoot}>
          <Button variant="light" onClick={goToLiveRooms}>
            Find your room
            <Icon name="arrow" />
          </Button>
        </div>
      </div>
      <HappeningNowCard />
    </section>
  );
}

/** "18:12": minutes and seconds, for the hero's countdown. */
function clockText(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** What the ring's centre says: the countdown while the timer runs or is paused, the phase otherwise. */
function centreText(room: RoomSummary, now: number): { time: string | null; label: string } {
  const { timer } = room;
  if (timer.phase === 'idle') return { time: null, label: 'Waiting to start' };
  if (timer.phase === 'done') return { time: null, label: 'Session complete' };
  const onBreak = timer.phase !== 'focus';
  if (!timer.endsAt) {
    return { time: clockText(timer.pausedRemaining ?? 0), label: onBreak ? 'break paused' : 'paused' };
  }
  const left = Math.max(0, Date.parse(timer.endsAt) - now);
  return { time: clockText(left), label: onBreak ? 'left in break' : `left in round ${timer.round}` };
}

/** The live room's ring and countdown, redrawn every second from `endsAt` (the server never ticks). */
function LiveRing({ room }: { room: RoomSummary }) {
  const now = useNow(1000);
  const { remaining } = phaseView(room.timer, room.timerSettings, now);
  const { time, label } = centreText(room, now);
  return (
    <span className={styles.pvRing}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className={styles.pvTrack} cx="60" cy="60" r={RING_RADIUS} strokeWidth="6" fill="none" />
        <circle
          className={styles.pvProgress}
          cx="60"
          cy="60"
          r={RING_RADIUS}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - remaining)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className={`${styles.pvTime} num`}>
        {time}
        <small>{label}</small>
      </span>
    </span>
  );
}

/** The hero's "Happening now" card: a room people are studying in right now, kept live by the lobby. */
function HappeningNowCard() {
  const rooms = useLiveRooms(ALL_ROOMS);
  const room = pickHappeningNow(rooms.data?.pages.flatMap((page) => page.rooms) ?? []);
  if (!room) return <QuietCard />;
  return (
    <Link
      className={`${styles.preview} ${styles.previewLink}`}
      to={`/room/${room.id}`}
      aria-label={`Join ${room.name}`}
    >
      <span className="eyebrow">Happening now</span>
      <span className={styles.pvTitle}>{room.name}</span>
      <LiveRing room={room} />
      <span className={styles.pvFoot}>
        <span>
          <b className="num">{room.memberCount}</b> studying
        </span>
        <span>
          Hosted by <b>{firstName(room.host.name)}</b>
        </span>
      </span>
    </Link>
  );
}

/** Happening now's empty form, also shown while rooms load or if they can't be loaded. */
function QuietCard() {
  return (
    <div className={styles.preview}>
      <span className="eyebrow">Happening now</span>
      <span className={styles.pvTitle}>No rooms live right now</span>
      <span className={styles.pvRing}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className={styles.pvTrack} cx="60" cy="60" r={RING_RADIUS} strokeWidth="6" fill="none" />
        </svg>
        <span className={styles.pvTime}>
          <small>Quiet for now</small>
        </span>
      </span>
      <span className={styles.pvFoot}>Open a room and others can join you.</span>
    </div>
  );
}
