import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { FollowedUser } from '@studibrowse/shared';
import { usersApi } from '../../lib/api';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { Avatar } from '../ui/Avatar';
import styles from './FollowingList.module.css';

interface FollowRowProps {
  person: FollowedUser;
  /** Hosting or in a room right now. */
  live?: boolean;
}

function FollowRow({ person, live }: FollowRowProps) {
  return (
    <li>
      <Link to={`/u/${person.username}`} className={styles.follow}>
        <span className={styles.avatar}>
          <Avatar initials={initialsOf(person.name)} tone={avatarTone(person.avatarColor)} size="sm" />
          {live ? <i className={styles.onDot} aria-hidden="true" /> : null}
        </span>
        <b>{person.name}</b>
        {live ? <span className="sr-only">, studying now</span> : null}
      </Link>
    </li>
  );
}

/** "People you follow" in the sidebar: name plus a live dot, nothing else. */
export function FollowingList({ following }: { following: string[] }) {
  // The ids are in the key, so following or unfollowing someone refetches the names.
  const query = useQuery({
    queryKey: ['following', following],
    queryFn: () => usersApi.following(),
    enabled: following.length > 0,
  });

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
      {/* Live dots arrive with rooms and presence. */}
      {query.data.users.map((person) => (
        <FollowRow key={person.id} person={person} />
      ))}
    </ul>
  );
}
