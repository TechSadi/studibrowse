import { Link } from 'react-router';
import type { FollowedUser, FollowLiveRoom } from '@studibrowse/shared';
import { useFollowingPeople } from '../../features/follows/useFollowingPeople';
import { useFollowLive } from '../../features/follows/useFollowLive';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { Avatar } from '../ui/Avatar';
import styles from './FollowingList.module.css';

interface FollowRowProps {
  person: FollowedUser;
  /** The public room they're in right now, if any. */
  live?: FollowLiveRoom | undefined;
}

function FollowRow({ person, live }: FollowRowProps) {
  // Live: a click joins their room, as in the mockup. Otherwise it opens their profile.
  const title = live ? `${live.isHost ? 'Hosting' : 'Studying in'} ${live.name}. Click to join.` : undefined;
  return (
    <li>
      <Link
        to={live ? `/room/${live.id}` : `/u/${person.username}`}
        className={styles.follow}
        {...(title ? { title } : {})}
      >
        <span className={styles.avatar}>
          <Avatar initials={initialsOf(person.name)} tone={avatarTone(person.avatarColor)} size="sm" />
          {live ? <i className={styles.onDot} aria-hidden="true" /> : null}
        </span>
        <b>{person.name}</b>
        {live ? <span className="sr-only">, {title}</span> : null}
      </Link>
    </li>
  );
}

/** "People you follow" in the sidebar: name plus a live dot, nothing else. */
export function FollowingList({ following }: { following: string[] }) {
  const query = useFollowingPeople(following);
  const live = useFollowLive(following);

  if (following.length === 0) {
    return <p className={styles.note}>Follow people to see when they&apos;re studying.</p>;
  }

  if (query.isPending) {
    return (
      <div role="status">
        <span className="sr-only">Loading people you follow…</span>
        <ul className={styles.list} aria-hidden="true">
          {following.slice(0, 3).map((id) => (
            <li key={id} className={styles.skeleton}>
              <i />
              <span />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className={styles.note}>
        Couldn&apos;t load the people you follow.{' '}
        <button type="button" className={styles.retry} onClick={() => void query.refetch()}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {query.data.users.map((person) => (
        <FollowRow key={person.id} person={person} live={live.get(person.id)} />
      ))}
    </ul>
  );
}
