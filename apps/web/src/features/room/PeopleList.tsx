import type { PresenceMember } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import { useNow } from '../../hooks/useNow';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { firstName, statusLine, statusSummary } from './people';
import styles from './PeopleList.module.css';

function HostCrown() {
  return (
    <>
      <Icon name="crown" className={styles.crown} />
      <span className="sr-only">(host)</span>
    </>
  );
}

interface PeopleProps {
  members: PresenceMember[];
  myUserId: string;
}

/** "In the room": a card per person on the stage (mockup `.people`). */
export function PeopleList({ members, myUserId }: PeopleProps) {
  const now = useNow(60_000);
  return (
    <section aria-labelledby="people-heading">
      <div className={styles.head}>
        <h2 id="people-heading">In the room</h2>
        <span className="muted">{statusSummary(members)}</span>
      </div>
      <ul className={styles.grid}>
        {members.map((member) => (
          <li key={member.userId} className={`${styles.person} ${styles[member.status]}`}>
            <Avatar initials={initialsOf(member.name)} tone={avatarTone(member.avatarColor)} />
            <div className={styles.grow}>
              <b>
                {member.userId === myUserId ? 'You' : firstName(member.name)}
                {member.isHost ? <HostCrown /> : null}
              </b>
              {member.workingOn ? (
                <span className={styles.working} title={member.workingOn}>
                  {member.workingOn}
                </span>
              ) : null}
              <small>{statusLine(member, now)}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The People tab of the side panel (mockup `#peopleList`). Host actions arrive with Phase 4. */
export function PeoplePanel({ members, myUserId }: PeopleProps) {
  const now = useNow(60_000);
  return (
    <ul className={styles.rows}>
      {members.map((member) => (
        <li key={member.userId} className={styles.row}>
          <Avatar initials={initialsOf(member.name)} tone={avatarTone(member.avatarColor)} size="sm" />
          <div className={styles.grow}>
            <b>
              {member.name}
              {member.userId === myUserId ? <span className={styles.you}>(you)</span> : null}
              {member.isHost ? <HostCrown /> : null}
            </b>
            <small>
              <span className={`${styles.sdot} ${styles[member.status]}`} />
              {statusLine(member, now)}
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}
