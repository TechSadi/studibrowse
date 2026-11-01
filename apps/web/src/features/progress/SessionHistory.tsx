import { useId, useRef, useState } from 'react';
import { SESSION_HISTORY_PAGE_SIZE, type MySession } from '@studibrowse/shared';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LivePill } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatMins } from '../rooms/timerText';
import { goalsText, roundsText, sessionDate } from './format';
import styles from './Progress.module.css';
import { useMySessions } from './queries';

const SKELETON_ROWS = 5;
const COLUMNS = ['Date', 'Room', 'Focus', 'Rounds', 'Goals done', 'People'];

function SessionRow({ session }: { session: MySession }) {
  return (
    <tr>
      <td className={styles.dateCell}>
        {sessionDate(session.startedAt)}
        {session.endedAt === null ? <LivePill className={styles.running}>In progress</LivePill> : null}
      </td>
      <td>{session.roomName}</td>
      <td className={styles.mono}>{formatMins(session.focusedMins)}</td>
      <td className={styles.mono}>{roundsText(session.roundsCompleted, session.roundsTotal)}</td>
      <td className={styles.mono}>{goalsText(session.goalsDone, session.goalsTotal)}</td>
      <td className={styles.mono}>{session.peopleCount}</td>
    </tr>
  );
}

function SkeletonRows() {
  return Array.from({ length: SKELETON_ROWS }, (_, row) => (
    <tr key={row}>
      {COLUMNS.map((column) => (
        <td key={column}>
          <Skeleton width={column === 'Room' ? '70%' : 48} />
        </td>
      ))}
    </tr>
  ));
}

/**
 * Progress › Session history: your sessions, newest first, a page at a time. Pages are cursors, so Newer
 * walks back through the ones already visited.
 */
export function SessionHistory() {
  const headingId = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  // Cursors of the pages visited so far; the first page has none.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const page = cursors.length;
  const query = useMySessions(cursors.at(-1), SESSION_HISTORY_PAGE_SIZE);
  const sessions = query.data?.sessions ?? [];
  const nextCursor = query.isPlaceholderData ? null : (query.data?.nextCursor ?? null);

  function go(next: (string | undefined)[]) {
    setCursors(next);
    tableRef.current?.focus();
  }

  let body;
  if (query.isError && !query.data) {
    body = (
      <EmptyState
        title="Couldn’t load your sessions"
        className={styles.panelError}
        action={
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      >
        {query.error.message}
      </EmptyState>
    );
  } else if (query.data && sessions.length === 0 && page === 1) {
    body = (
      <EmptyState
        title="No sessions yet"
        className={styles.panelError}
        action={
          <ButtonLink to="/home#live" variant="ghost" size="sm">
            Find a room
          </ButtonLink>
        }
      >
        Every session you finish in a room shows up here, with your focus time, rounds and goals.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div
          ref={tableRef}
          className={styles.tableWrap}
          role="region"
          aria-label="Session history table"
          tabIndex={0}
        >
          <table className={styles.table} aria-busy={query.isPending || query.isPlaceholderData}>
            <caption className="sr-only">Session history, page {page}</caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <SkeletonRows />
              ) : (
                sessions.map((session) => <SessionRow key={session.id} session={session} />)
              )}
            </tbody>
          </table>
          {query.isPending ? (
            <span className="sr-only" role="status">
              Loading your sessions
            </span>
          ) : null}
        </div>
        {page > 1 || nextCursor ? (
          <nav className={styles.pager} aria-label="Session history pages">
            <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => go(cursors.slice(0, -1))}>
              Newer
            </Button>
            <span aria-live="polite">Page {page}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!nextCursor}
              onClick={() => nextCursor && go([...cursors, nextCursor])}
            >
              Older
            </Button>
          </nav>
        ) : null}
      </>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.panelHead}>
        <h2 id={headingId}>Session history</h2>
      </div>
      {body}
    </section>
  );
}
