import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { FocusRoom } from './FocusRoom';
import { RoomStateScreen } from './RoomStateScreen';
import { SessionSummaryDialog } from './SessionSummaryDialog';
import { useRoomSession } from './useRoomSession';

/**
 * `/room/:roomId`. Joins over the socket and shows the room, or the screen for why it can't: joining, full,
 * closed, not found, removed or an error. `?invite=<code>` lets someone who isn't the host into a private room.
 * Leave shows the session summary; Rejoin from there joins again. The host closing the room shows it too,
 * without Rejoin.
 */
export function RoomPage() {
  const { roomId = '' } = useParams();
  const [params] = useSearchParams();
  const inviteCode = params.get('invite') ?? undefined;
  const { state: auth } = useAuth();
  const navigate = useNavigate();
  const { state, retry, leave, rejoin } = useRoomSession(roomId, inviteCode);
  const [leaveSaved, setLeaveSaved] = useState(false);

  if (!auth.user) return null;
  if (state.status === 'joined' || state.status === 'rejoining') {
    return (
      <FocusRoom
        joined={state.joined}
        rejoining={state.status === 'rejoining'}
        user={auth.user}
        inviteCode={inviteCode}
        onLeave={() => {
          setLeaveSaved(false);
          void leave().then(() => setLeaveSaved(true));
        }}
      />
    );
  }
  if (state.status === 'left' || state.status === 'closedByHost') {
    // The room itself is gone (its uploads cancelled, its sounds off); the dialog sits on the plain page.
    return (
      <main>
        <SessionSummaryDialog
          joined={state.joined}
          userName={auth.user.name}
          // The server saved everyone's focus time before it said the room closed.
          saved={leaveSaved || state.status === 'closedByHost'}
          onHome={() => navigate('/home')}
          onRejoin={rejoin}
          closedByHost={state.status === 'closedByHost'}
        />
      </main>
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
