import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { ModalShell } from '../../components/ui/ModalShell';
import { sessionsApi } from '../../lib/api';
import { invalidateProgress } from '../progress/queries';
import { firstName } from './people';
import type { JoinedRoom } from './roomSession';
import { summaryView } from './sessionSummary';
import styles from './SessionSummaryDialog.module.css';

interface SessionSummaryDialogProps {
  /** The room as you left it. */
  joined: JoinedRoom;
  userName: string;
  /** The server has saved your focus time, so the summary can load. */
  saved: boolean;
  onHome: () => void;
  onRejoin: () => void;
}

const PENDING = '–';

/**
 * The session summary after Leave (mockup `#summary`): your latest session in the room, your week against
 * your goal, and Back to home or Rejoin (only while the room is open). You've already left, so Escape and
 * the backdrop go home.
 */
export function SessionSummaryDialog({
  joined,
  userName,
  saved,
  onHome,
  onRejoin,
}: SessionSummaryDialogProps) {
  const titleId = useId();
  const subtitleId = useId();
  const { room, joinedAt } = joined;
  const query = useQuery({
    queryKey: ['sessions', 'latest', room.id, joinedAt],
    queryFn: () => sessionsApi.latestMine(room.id, joinedAt),
    enabled: saved,
    // Just written: always ask, never show a cached answer from an earlier leave.
    gcTime: 0,
  });
  const view = query.data ? summaryView(query.data, room.goals) : null;
  const queryClient = useQueryClient();
  const loaded = query.isSuccess;
  useEffect(() => {
    // Your time is saved now: refresh Home, Progress and the streak card so they show it.
    if (loaded) invalidateProgress(queryClient);
  }, [loaded, queryClient]);

  return (
    <ModalShell
      onClose={onHome}
      labelledBy={titleId}
      describedBy={subtitleId}
      className={styles.sum}
      initialFocus={(dialog) => dialog.querySelector<HTMLElement>('[data-autofocus]')}
    >
      <span className={styles.ico} aria-hidden="true">
        <Icon name="check" />
      </span>
      <h2 id={titleId}>Nice session, {firstName(userName)}</h2>
      <p id={subtitleId}>You left {room.name}. Here’s what you got done.</p>

      {query.isError ? (
        <p className={styles.error} role="alert">
          We couldn’t load your summary. Your focus time is still saved.
        </p>
      ) : (
        <>
          <div className={styles.stats} aria-busy={!view}>
            <div>
              <b className="num">{view?.focused ?? PENDING}</b>
              <span>focused</span>
            </div>
            <div>
              <b className="num">{view?.rounds ?? PENDING}</b>
              <span>rounds</span>
            </div>
            <div>
              <b className="num">{view?.goals ?? PENDING}</b>
              <span>room goals</span>
            </div>
          </div>
          <div className={styles.weekly}>
            <div>
              <b>Weekly goal</b>
              <small>{view?.weekly ?? 'Adding up your week…'}</small>
            </div>
            <b className={`num ${styles.percent}`}>{view?.weeklyPercent ?? PENDING}</b>
          </div>
        </>
      )}

      <div className={styles.actions}>
        <Button block onClick={onHome} data-autofocus>
          Back to home
        </Button>
        {query.data?.roomOpen ? (
          <Button variant="ghost" block onClick={onRejoin}>
            Rejoin the room
          </Button>
        ) : null}
      </div>
    </ModalShell>
  );
}
