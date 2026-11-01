import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Avatar, AvatarStack } from '../../components/ui/Avatar';
import { Brand } from '../../components/ui/Brand';
import { LivePill } from '../../components/ui/Pill';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { LIVE_STATS } from '../welcome/landingContent';
import styles from './AuthShell.module.css';

const RING_RADIUS = 52;
const RING_LENGTH = 326.7; // 2πr for r = 52

function AuthArt() {
  return (
    <aside className={styles.art} aria-hidden="true">
      <Brand />
      <div className={styles.mid}>
        <LivePill className={styles.pill}>{LIVE_STATS.liveRooms} rooms live right now</LivePill>
        <h2>Study with people, not alone.</h2>
        <p className={styles.lead}>
          One shared timer, a room full of people working on their own thing, and chat for the breaks.
        </p>
        <div className={styles.mockRoom}>
          <span className={styles.ring}>
            <svg viewBox="0 0 120 120">
              <circle className={styles.track} cx="60" cy="60" r={RING_RADIUS} strokeWidth="6" fill="none" />
              <circle
                className={styles.arc}
                cx="60"
                cy="60"
                r={RING_RADIUS}
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset="91"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <span className={`${styles.time} num`}>
              18:12<small>round 3</small>
            </span>
          </span>
          <div>
            <h4>Late-night exam grind</h4>
            <small>14 studying · hosted by Maya</small>
            <AvatarStack
              people={[
                { initials: 'MK', tone: 2 },
                { initials: 'JD', tone: 1 },
                { initials: 'RL', tone: 3 },
                { initials: 'NK', tone: 4 },
              ]}
              more={10}
            />
            <div className={styles.msg}>
              <b>Maya</b> Break at 10:42, see you all then.
            </div>
          </div>
        </div>
      </div>
      <div className={styles.quote}>
        <Avatar initials="RL" tone={3} size="sm" />
        <span>
          &quot;I finally finished my thesis chapter because people were waiting in the room.&quot;{' '}
          <b>Riley, MSc student</b>
        </span>
      </div>
    </aside>
  );
}

interface AuthShellProps {
  /** Browser tab title. */
  title: string;
  /** Which link the top-right corner offers. */
  switchTo: 'login' | 'signup';
  children: ReactNode;
}

/** Split layout shared by Sign up, Log in, Forgot password and Reset password. */
export function AuthShell({ title, switchTo, children }: AuthShellProps) {
  // Keep ?next= (e.g. from an invite link) when switching between Sign up and Log in.
  const { search } = useLocation();
  useEffect(() => {
    document.title = `${title} · StudiBrowse`;
  }, [title]);

  return (
    <div className={styles.shell}>
      <AuthArt />
      <div className={styles.side}>
        <div className={styles.top}>
          <Link to="/" className={styles.topBrand} aria-label="StudiBrowse home">
            <Brand />
          </Link>
          <span>
            {switchTo === 'login' ? (
              <>
                Have an account?{' '}
                <Link className="text-link" to={{ pathname: '/login', search }}>
                  Log in
                </Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link className="text-link" to={{ pathname: '/signup', search }}>
                  Sign up
                </Link>
              </>
            )}
          </span>
          <ThemeToggle />
        </div>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
