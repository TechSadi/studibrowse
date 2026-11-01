import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { RoomFilter } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNow } from '../../hooks/useNow';
import { useSearchParam } from '../../hooks/useSearchParam';
import { roomsApi } from '../../lib/api';
import { onRadioKeyDown } from '../../lib/radioGroup';
import styles from './Home.module.css';
import { RoomCard, RoomCardSkeleton } from './RoomCard';
import { useCreateRoomDialog } from './useCreateRoomDialog';

const FILTERS: { id: RoomFilter; label: string }[] = [
  { id: 'all', label: 'All rooms' },
  { id: 'open', label: 'Has space' },
  { id: 'focus', label: 'In a focus round' },
  { id: 'break', label: 'On a break' },
];

const SEARCH_DEBOUNCE_MS = 250;
/** Cards say "N min left", so a refresh every 30 seconds keeps them right to the minute. */
const CLOCK_MS = 30_000;

function usePublicRooms(filter: RoomFilter, q: string, subject: string) {
  return useInfiniteQuery({
    queryKey: ['rooms', 'public', { filter, q, subject }],
    queryFn: ({ pageParam }) => roomsApi.listPublic({ page: pageParam, filter, q, subject }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

/** Rooms worth joining: live public rooms, people you follow first. */
export function LiveRooms() {
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [query, setQuery] = useSearchParam('q');
  const [subject, setSubject] = useSearchParam('subject');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const createRoom = useCreateRoomDialog();
  const rooms = usePublicRooms(filter, debouncedQuery, subject);
  const now = useNow(CLOCK_MS);
  const list = rooms.data?.pages.flatMap((page) => page.rooms) ?? [];
  const narrowed = query.trim() !== '' || subject !== '' || filter !== 'all';

  function emptyTitle() {
    if (query.trim()) return `No live rooms match “${query.trim()}”`;
    if (narrowed) return 'No live rooms match that';
    return 'No live rooms right now';
  }

  let content;
  if (rooms.isPending) {
    content = (
      <>
        <span className="sr-only" role="status">
          Loading live rooms
        </span>
        <RoomCardSkeleton />
        <RoomCardSkeleton />
        <RoomCardSkeleton />
      </>
    );
  } else if (rooms.isError) {
    content = (
      <EmptyState
        title="Couldn’t load live rooms"
        action={
          <Button variant="ghost" size="sm" onClick={() => void rooms.refetch()}>
            Reload rooms
          </Button>
        }
      >
        {rooms.error.message}
      </EmptyState>
    );
  } else if (list.length === 0) {
    content = (
      <EmptyState
        title={emptyTitle()}
        action={
          <Button variant="ghost" size="sm" onClick={createRoom.open}>
            <Icon name="plus" />
            Create a room
          </Button>
        }
      >
        {narrowed
          ? 'Try another filter, or create your own room.'
          : 'Open one and share the link with your study group. Rooms opened by people you follow will show up here first.'}
      </EmptyState>
    );
  } else {
    content = list.map((room) => <RoomCard key={room.id} room={room} now={now} onSubject={setSubject} />);
  }

  return (
    <section id="live" className={styles.section} aria-labelledby="live-heading">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="live-heading" tabIndex={-1}>
            Rooms worth joining
          </h2>
          <p>Live now. Rooms opened by people you follow come first.</p>
        </div>
      </div>
      <div className={styles.filters}>
        <div className={styles.chips} role="radiogroup" aria-label="Filter rooms">
          {FILTERS.map((option, index) => {
            const on = option.id === filter;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={on ? `${styles.chip} ${styles.chipOn}` : styles.chip}
                onClick={() => setFilter(option.id)}
                onKeyDown={(e) => onRadioKeyDown(e, index, FILTERS.length, (i) => setFilter(FILTERS[i]!.id))}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {subject ? (
          <button
            type="button"
            className={`${styles.chip} ${styles.subjectChip}`}
            onClick={() => setSubject('')}
            aria-label={`Clear subject filter: ${subject}`}
          >
            Subject: {subject}
            <Icon name="x" />
          </button>
        ) : null}
        <label className={styles.search}>
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms or subjects"
            aria-label="Search rooms or subjects"
          />
        </label>
      </div>
      <div className={styles.rooms} aria-busy={rooms.isPending || rooms.isFetchingNextPage}>
        {content}
      </div>
      {rooms.hasNextPage ? (
        <div className={styles.more}>
          <Button
            variant="ghost"
            onClick={() => void rooms.fetchNextPage()}
            disabled={rooms.isFetchingNextPage}
          >
            {rooms.isFetchingNextPage ? 'Loading…' : 'Show more rooms'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
