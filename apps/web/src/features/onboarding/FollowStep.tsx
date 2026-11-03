import { useQuery } from '@tanstack/react-query';
import type { SuggestedUser } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Field';
import { FollowButton } from '../../components/ui/FollowButton';
import { usersApi } from '../../lib/api';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { useAuth } from '../auth/AuthContext';
import { useFollowToggle } from '../follows/useFollowToggle';
import styles from './Onboarding.module.css';

export const SUGGESTIONS_QUERY_KEY = ['users', 'suggestions'] as const;

function subtitleOf(person: SuggestedUser): string {
  return person.studying || person.subjects.join(' · ') || `@${person.username}`;
}

export function FollowStep() {
  const { state } = useAuth();
  const following = state.user?.following ?? [];
  const suggestions = useQuery({ queryKey: SUGGESTIONS_QUERY_KEY, queryFn: usersApi.suggestions });
  const { toggle, isBusy, error } = useFollowToggle();

  if (suggestions.isPending) {
    return (
      <div className={styles.suggest} role="status" aria-label="Loading suggestions">
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.sug} aria-hidden="true">
            <span className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
            <div className={styles.grow}>
              <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
              <span className={`${styles.skeleton} ${styles.skeletonLine} ${styles.skeletonShort}`} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (suggestions.isError) {
    return (
      <div className={styles.notice} role="alert">
        <p>We couldn’t load suggestions. {suggestions.error.message}</p>
        <Button variant="ghost" size="sm" onClick={() => void suggestions.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (suggestions.data.users.length === 0) {
    return (
      <div className={styles.notice}>
        <p>
          <b>No one to suggest yet.</b> You can follow people from their profile or after you study together.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className={styles.suggest}>
        {suggestions.data.users.map((person) => {
          const isFollowing = following.includes(person.id);
          return (
            <li key={person.id} className={styles.sug}>
              <Avatar initials={initialsOf(person.name)} tone={avatarTone(person.avatarColor)} />
              <div className={styles.grow}>
                <b>{person.name}</b>
                <small>{subtitleOf(person)}</small>
              </div>
              <FollowButton
                name={person.name}
                following={isFollowing}
                disabled={isBusy(person.id)}
                onToggle={() => toggle(person.id, !isFollowing)}
              />
            </li>
          );
        })}
      </ul>
      <FormError>{error?.message}</FormError>
    </>
  );
}
