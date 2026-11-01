import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { PlaceholderScreen } from '../../components/layout/PlaceholderScreen';
import { Button } from '../../components/ui/Button';
import { CopyLinkButton } from '../../components/ui/CopyLinkButton';
import { ApiError, roomsApi } from '../../lib/api';
import styles from './RoomPlaceholderPage.module.css';

export function inviteUrl(code: string): string {
  return `${window.location.origin}/r/${code}`;
}

function BackHome() {
  return (
    <Link className="text-link" to="/home">
      Back to Home
    </Link>
  );
}

/**
 * Stands in for the focus room until live rooms arrive: names the room and hands the host its invite link.
 * Create a room seeds the query cache, so this renders at once after creating.
 */
export function RoomPlaceholderPage() {
  const { roomId = '' } = useParams();
  const query = useQuery({ queryKey: ['rooms', roomId], queryFn: () => roomsApi.get(roomId) });

  if (query.isPending) {
    return (
      <PlaceholderScreen title="Focus room">
        <p role="status">Opening the room…</p>
      </PlaceholderScreen>
    );
  }

  if (query.isError) {
    const missing = query.error instanceof ApiError && [400, 404].includes(query.error.status);
    return (
      <PlaceholderScreen title={missing ? 'Room not found' : 'Focus room'}>
        <p role="alert">{missing ? 'This room has ended, or the link is wrong.' : query.error.message}</p>
        {missing ? null : (
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        )}
        <BackHome />
      </PlaceholderScreen>
    );
  }

  const { room } = query.data;
  const url = room.inviteCode ? inviteUrl(room.inviteCode) : null;

  return (
    <PlaceholderScreen title={room.name}>
      <p>
        {room.isHost ? 'You’re the host. ' : null}
        Live timers and chat open here soon. For now, share the link so people can find the room.
      </p>
      {url ? (
        <div className={styles.invite}>
          <label className={styles.lbl} htmlFor="invite-link">
            Invite link
          </label>
          <div className={styles.row}>
            <input
              id="invite-link"
              className={styles.link}
              value={url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyLinkButton url={url} />
          </div>
          <small className={styles.hint}>
            {room.isPublic
              ? 'It’s also listed in Rooms worth joining.'
              : 'Private room: only people with this link can find it.'}
          </small>
        </div>
      ) : null}
      <BackHome />
    </PlaceholderScreen>
  );
}
