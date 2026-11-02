import { useNavigate } from 'react-router';
import type { ClosedRoomPreview } from '@studibrowse/shared';
import { SoloCard } from '../../components/layout/SoloScreen';
import { Avatar } from '../../components/ui/Avatar';
import { ButtonLink } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Field';
import { FollowButton } from '../../components/ui/FollowButton';
import { Icon } from '../../components/ui/Icon';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { useAuth } from '../auth/AuthContext';
import { useFollowToggle } from '../follows/useFollowToggle';
import { CREATE_ROOM_PATH } from '../home/useCreateRoomDialog';
import styles from './Invite.module.css';
import { authPathFor, roomsPerWeekText } from './invitePreview';

interface RoomClosedCardProps {
  room: ClosedRoomPreview;
  code: string;
}

/** An invite link to a room that has ended (mockup `#closed`): follow the host, or find another room. */
export function RoomClosedCard({ room, code }: RoomClosedCardProps) {
  const { state } = useAuth();
  const navigate = useNavigate();
  const me = state.user;
  const following = me?.following.includes(room.host.id) ?? false;
  const { toggle, isBusy, error } = useFollowToggle();

  function onToggle() {
    // Following needs an account; sign up and come back here.
    if (!me) navigate(authPathFor('signup', code));
    else toggle(room.host.id, !following);
  }

  return (
    <SoloCard className={styles.closed}>
      <span className={styles.ico}>
        <Icon name="exit" />
      </span>
      <h1>This room has closed</h1>
      <p className="muted">
        “{room.name}” ended when everyone left. Rooms don’t stay open, but you can follow the host to hear
        when they open the next one.
      </p>
      <div className={styles.hostRow}>
        <span className={styles.host}>
          <Avatar initials={initialsOf(room.host.name)} tone={avatarTone(room.host.avatarColor)} />
          <span>
            <b>{room.host.name}</b>
            <small>{roomsPerWeekText(room.roomsPerWeek) ?? `@${room.host.username}`}</small>
          </span>
        </span>
        {me?.id === room.host.id ? null : (
          <FollowButton
            name={room.host.name}
            following={following}
            disabled={isBusy(room.host.id)}
            onToggle={onToggle}
          />
        )}
      </div>
      <div className={styles.error}>
        <FormError>{error?.message}</FormError>
      </div>
      <div className={styles.actions}>
        <ButtonLink block to="/home">
          See rooms that are live now
        </ButtonLink>
        <ButtonLink variant="ghost" block to={CREATE_ROOM_PATH}>
          Open your own room
        </ButtonLink>
      </div>
    </SoloCard>
  );
}
