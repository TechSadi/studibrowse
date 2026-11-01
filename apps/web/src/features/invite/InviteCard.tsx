import type { InvitePreview } from '@studibrowse/shared';
import { SoloCard } from '../../components/layout/SoloScreen';
import { Avatar, AvatarStack } from '../../components/ui/Avatar';
import { ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LiveDot } from '../../components/ui/Pill';
import { useNow } from '../../hooks/useNow';
import { avatarTone, initialsOf } from '../../lib/avatar';
import styles from './Invite.module.css';
import { authPathFor, inviteStats, joinHint } from './invitePreview';

interface InviteCardProps {
  room: InvitePreview;
  code: string;
}

/** The room preview a signed-out visitor sees on an invite link (mockup `#invite`). */
export function InviteCard({ room, code }: InviteCardProps) {
  const now = useNow(1000);
  const stats = inviteStats(room.timer, room.timerSettings, now);
  const hint = joinHint(room.timer);
  const full = room.memberCount >= room.maxSize;
  const more = room.memberCount - room.members.length;

  return (
    <>
      <SoloCard>
        <div className={styles.from}>
          <Avatar initials={initialsOf(room.host.name)} tone={avatarTone(room.host.avatarColor)} />
          <span>
            <b>{room.host.name}</b> invited you to study together
          </span>
        </div>
        <div className={styles.badges}>
          <span className={styles.liveTag}>
            <LiveDot className={styles.liveDot} />
            Live
          </span>
          {room.subject ? <span className={styles.tag}>{room.subject}</span> : null}
          <span
            className={full ? `${styles.cap} ${styles.full}` : styles.cap}
            aria-label={`${room.memberCount} of ${room.maxSize} people`}
          >
            {room.memberCount}/{room.maxSize}
          </span>
        </div>
        <h1 className={styles.title}>{room.name}</h1>
        {room.description ? <p className="muted">{room.description}</p> : null}

        <dl className={styles.stats}>
          <div>
            <dt>Right now</dt>
            <dd>{stats.phase}</dd>
          </div>
          <div>
            <dt>Time left</dt>
            <dd className="num">{stats.timeLeft}</dd>
          </div>
          <div>
            <dt>Round</dt>
            <dd className="num">{stats.round}</dd>
          </div>
        </dl>

        {room.goals.length > 0 ? (
          <>
            <span className={styles.lbl} id="invite-goals">
              Room goals
            </span>
            <ul className={styles.goals} aria-labelledby="invite-goals">
              {room.goals.map((goal) => (
                <li key={goal.text}>
                  <Icon name={goal.done ? 'check' : 'target'} />
                  {goal.text}
                  {goal.done ? <span className="sr-only"> (done)</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {room.memberCount > 0 || hint ? (
          <div className={styles.people}>
            {room.memberCount > 0 ? (
              <div aria-label={`${room.memberCount} studying now`} role="img">
                <AvatarStack
                  people={room.members.map((member) => ({
                    initials: member.initials,
                    tone: avatarTone(member.avatarColor),
                  }))}
                  more={more > 0 ? more : undefined}
                />
              </div>
            ) : (
              <span />
            )}
            {hint ? <small className="muted">{hint}</small> : null}
          </div>
        ) : null}

        <div className={styles.actions}>
          <ButtonLink block to={authPathFor('signup', code)}>
            Sign up to join
          </ButtonLink>
          <ButtonLink variant="ghost" block to={authPathFor('login', code)}>
            I already have an account
          </ButtonLink>
        </div>
      </SoloCard>
      <p className={styles.footNote}>Rooms close 5 minutes after the last person leaves.</p>
    </>
  );
}
