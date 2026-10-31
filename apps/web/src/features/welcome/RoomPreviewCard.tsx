import { Avatar } from '../../components/ui/Avatar';
import { LiveDot } from '../../components/ui/Pill';
import styles from './RoomPreviewCard.module.css';

const RING_RADIUS = 54;
const RING_LENGTH = 339.3; // 2πr for r = 54
const RING_OFFSET = 110; // about 68% of the round elapsed, as in the mockup

const PEOPLE = [
  { initials: 'MK', tone: 2, task: 'Chem flashcards' },
  { initials: 'JD', tone: 1, task: 'History essay' },
  { initials: 'NK', tone: 4, task: 'React hooks' },
] as const;

/** Decorative "live room" window on the Welcome hero. Static content; hidden from screen readers. */
export function RoomPreviewCard() {
  return (
    <div className={styles.shot} aria-hidden="true">
      <div className={styles.bar}>
        <i />
        <i />
        <i />
      </div>
      <div className={styles.body}>
        <div className={styles.stage}>
          <span className={styles.phase}>
            <LiveDot className={styles.phaseDot} />
            Focus
          </span>
          <div className={styles.ring}>
            <svg viewBox="0 0 120 120">
              <circle className={styles.track} cx="60" cy="60" r={RING_RADIUS} strokeWidth="5" fill="none" />
              <circle
                className={styles.arc}
                cx="60"
                cy="60"
                r={RING_RADIUS}
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_OFFSET}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <span className="num">18:12</span>
          </div>
          <b className={styles.name}>Late-night exam grind</b>
          <small className="muted">Round 3 of 4 · hosted by Maya</small>
          <div className={styles.people}>
            {PEOPLE.map((p) => (
              <span key={p.initials}>
                <Avatar initials={p.initials} tone={p.tone} size="sm" />
                {p.task}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.chat}>
          <b className={styles.chatTitle}>Room chat</b>
          <div className={styles.msg}>
            <b>Maya</b> Going for 4 rounds tonight.
          </div>
          <div className={styles.msg}>
            <b>Jamie</b> Finishing my essay draft.
          </div>
          <div className={`${styles.msg} ${styles.mine}`}>Let&apos;s keep chat for breaks.</div>
          <div className={styles.msg}>
            <b>Nikhil</b> Shared a playlist in Files.
          </div>
        </div>
      </div>
    </div>
  );
}
