import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import styles from './Home.module.css';

const RING_RADIUS = 52;

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

/** The hero's "Happening now" card. Shows its empty form until live rooms exist. */
function HappeningNowCard() {
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
