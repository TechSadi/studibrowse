import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { FollowListUser, UserProfile } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormError } from '../../components/ui/Field';
import { FollowButton } from '../../components/ui/FollowButton';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { useAuth } from '../auth/AuthContext';
import { useFollowToggle } from '../follows/useFollowToggle';
import { firstName } from './format';
import styles from './Profile.module.css';
import { useFollowList, type FollowListKind } from './queries';

interface FollowListModalProps {
  profile: UserProfile;
  kind: FollowListKind;
  onClose: () => void;
}

function emptyText(profile: UserProfile, kind: FollowListKind): string {
  const who = profile.isMe ? 'You' : firstName(profile.name);
  if (kind === 'followers') return profile.isMe ? 'No one follows you yet.' : `No one follows ${who} yet.`;
  return `${who} ${profile.isMe ? 'don’t' : 'doesn’t'} follow anyone yet.`;
}

function PersonRow({ person, onClose }: { person: FollowListUser; onClose: () => void }) {
  const { state } = useAuth();
  const { toggle, isBusy, error } = useFollowToggle();
  const following = state.user?.following.includes(person.id) ?? person.isFollowing;
  return (
    <li className={styles.person}>
      <Link to={`/u/${person.username}`} className={styles.personLink} onClick={onClose}>
        <Avatar initials={initialsOf(person.name)} tone={avatarTone(person.avatarColor)} />
        <span className={styles.personText}>
          <b>{person.name}</b>
          <small>{person.studying || `@${person.username}`}</small>
        </span>
      </Link>
      {state.user?.id === person.id ? null : (
        <FollowButton
          name={person.name}
          following={following}
          disabled={isBusy(person.id)}
          onToggle={() => toggle(person.id, !following)}
        />
      )}
      {error ? <FormError>{error.message}</FormError> : null}
    </li>
  );
}

/** A profile's Followers or Following list, opened from its counts, a page at a time. */
export function FollowListModal({ profile, kind, onClose }: FollowListModalProps) {
  const list = useFollowList(profile.username, kind);
  const people = list.data?.pages.flatMap((page) => page.users) ?? [];
  const listRef = useRef<HTMLUListElement>(null);
  // How many people were shown when Show more was pressed. The button can disappear with the last page, so
  // focus moves to the first new person instead of falling out of the dialog.
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || people.length <= from) return;
    focusFrom.current = null;
    listRef.current?.querySelectorAll<HTMLElement>('li > a')[from]?.focus();
  }, [people.length]);

  function showMore() {
    focusFrom.current = people.length;
    void list.fetchNextPage();
  }

  let content;
  if (list.isPending) {
    content = (
      <>
        <span className="sr-only" role="status">
          Loading
        </span>
        <ul className={styles.people} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className={styles.person}>
              <Skeleton width={36} height={36} radius="50%" />
              <Skeleton width="50%" />
            </li>
          ))}
        </ul>
      </>
    );
  } else if (!list.data) {
    // Only a failed first page leaves no data; a failed "Show more" keeps the people already shown.
    content = (
      <EmptyState
        title="Couldn’t load this list"
        action={
          <Button variant="ghost" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      >
        {list.error?.message}
      </EmptyState>
    );
  } else if (people.length === 0) {
    content = <EmptyState title={emptyText(profile, kind)} />;
  } else {
    content = (
      <>
        <ul className={styles.people} ref={listRef}>
          {people.map((person) => (
            <PersonRow key={person.id} person={person} onClose={onClose} />
          ))}
        </ul>
        {list.hasNextPage ? (
          <div className={styles.more}>
            <Button variant="ghost" size="sm" disabled={list.isFetchingNextPage} onClick={showMore}>
              {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          </div>
        ) : null}
        <FormError>{list.isFetchNextPageError ? list.error.message : undefined}</FormError>
      </>
    );
  }

  return (
    <Modal
      title={kind === 'followers' ? 'Followers' : 'Following'}
      subtitle={profile.isMe ? 'Your profile' : `${profile.name} · @${profile.username}`}
      onClose={onClose}
    >
      {content}
    </Modal>
  );
}
