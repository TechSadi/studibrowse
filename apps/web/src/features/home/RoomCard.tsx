import type { RoomSummary } from '@studibrowse/shared';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LiveDot } from '../../components/ui/Pill';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { phaseView, type PhaseTone } from '../rooms/timerText';
import styles from './RoomCard.module.css';

const RING_RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const RING_CLASS: Record<PhaseTone, string | undefined> = {
  focus: styles.ringFocus,
  break: styles.ringBreak,
  idle: styles.ringIdle,
};

function MiniRing({ remaining, tone }: { remaining: number; tone: PhaseTone }) {
  return (
    <svg className={styles.miniRing} viewBox="0 0 36 36" aria-hidden="true">
      <circle className={styles.ringTrack} cx="18" cy="18" r={RING_RADIUS} />
      <circle
        className={RING_CLASS[tone]}
        cx="18"
        cy="18"
        r={RING_RADIUS}
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - remaining)}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

interface RoomCardProps {
  room: RoomSummary;
  now: number;
  /** Filters the list to this room's subject. */
  onSubject: (subject: string) => void;
}

/** A live room in Rooms worth joining (mockup `.room-card`). */
export function RoomCard({ room, now, onSubject }: RoomCardProps) {
  const full = room.memberCount >= room.maxSize;
  const phase = phaseView(room.timer, room.timerSettings, now);
  const tone = avatarTone(room.host.avatarColor);
  const hostFirstName = room.host.name.trim().split(/\s+/)[0] ?? room.host.name;
  const className = room.hostFollowed ? `${styles.card} ${styles.followed}` : styles.card;

  return (
    <article className={className} aria-label={room.name}>
      <div>
        <div className={styles.head}>
          <span className={`${styles.subj} ${styles[`c${tone}`]}`} aria-hidden="true">
            {initialsOf(room.subject || room.name)}
          </span>
          <div className={styles.badges}>
            <span className={styles.liveTag}>
              <LiveDot className={styles.liveDot} />
              Live
            </span>
            <span
              className={full ? `${styles.cap} ${styles.full}` : styles.cap}
              aria-label={`${room.memberCount} of ${room.maxSize} people`}
            >
              {room.memberCount}/{room.maxSize}
            </span>
          </div>
        </div>
        {room.hostFollowed ? (
          <div className={styles.followedLabel}>
            <Icon name="users" />
            You follow {hostFirstName}
          </div>
        ) : null}
        <h3 className={styles.title}>{room.name}</h3>
        <div className={styles.meta}>
          {room.subject ? (
            <button
              type="button"
              className={styles.tag}
              onClick={() => onSubject(room.subject)}
              aria-label={`Show ${room.subject} rooms`}
            >
              {room.subject}
            </button>
          ) : null}
          <span>Hosted by {room.host.name}</span>
        </div>
      </div>
      <div className={styles.phase}>
        <MiniRing remaining={phase.remaining} tone={phase.tone} />
        <div>
          <b>{phase.title}</b>
          <small className="num">{phase.detail}</small>
        </div>
      </div>
      <div className={styles.foot}>
        <span className={styles.studying}>
          {room.memberCount ? (
            <>
              <b className="num">{room.memberCount}</b> studying now
            </>
          ) : (
            'Be the first one in'
          )}
        </span>
        {full ? (
          <Button variant="ghost" size="sm" disabled>
            Room is full
          </Button>
        ) : (
          <ButtonLink size="sm" to={`/room/${room.id}`} aria-label={`Join ${room.name}`}>
            Join room
            <Icon name="arrow" />
          </ButtonLink>
        )}
      </div>
    </article>
  );
}

/** A grey stand-in card while rooms load. */
export function RoomCardSkeleton() {
  return <div className={`${styles.card} ${styles.skeleton}`} aria-hidden="true" />;
}
