import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { FocusRoom } from './FocusRoom';
import { RoomStateScreen } from './RoomStateScreen';
import { useRoomSession } from './useRoomSession';

/**
 * `/room/:roomId`. Joins over the socket and shows the room, or the screen for why it can't: joining, full,
 * closed, not found, removed or an error. `?invite=<code>` lets someone who isn't the host into a private room.
 */
export function RoomPage() {
  const { roomId = '' } = useParams();
  const [params] = useSearchParams();
  const inviteCode = params.get('invite') ?? undefined;
  const { state: auth } = useAuth();
  const navigate = useNavigate();
  const { state, retry } = useRoomSession(roomId, inviteCode);

  if (!auth.user) return null;
  if (state.status === 'joined' || state.status === 'rejoining') {
    return (
      <FocusRoom
        joined={state.joined}
        rejoining={state.status === 'rejoining'}
        user={auth.user}
        inviteCode={inviteCode}
        // Leaving the page leaves the room (see useRoomSession). The session summary arrives with Phase 3.
        onLeave={() => navigate('/home')}
      />
    );
  }
  return (
    <RoomStateScreen
      kind={state.status}
      message={state.status === 'error' ? state.message : undefined}
      onRetry={retry}
    />
  );
}
