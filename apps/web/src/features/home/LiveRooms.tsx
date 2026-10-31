import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { useSearchParam } from '../../hooks/useSearchParam';
import { onRadioKeyDown } from '../../lib/radioGroup';
import styles from './Home.module.css';
import { useCreateRoomDialog } from './useCreateRoomDialog';

const FILTERS = [
  { id: 'all', label: 'All rooms' },
  { id: 'open', label: 'Has space' },
  { id: 'focus', label: 'In a focus round' },
  { id: 'break', label: 'On a break' },
] as const;

type RoomFilter = (typeof FILTERS)[number]['id'];

/** Rooms worth joining. Live rooms arrive with room creation; until then this shows its empty state. */
export function LiveRooms() {
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [query, setQuery] = useSearchParam('q');
  const createRoom = useCreateRoomDialog();
  const searching = query.trim() !== '';

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
      <div className={styles.rooms}>
        <EmptyState
          title={searching ? `No live rooms match “${query.trim()}”` : 'No live rooms right now'}
          action={
            <Button variant="ghost" size="sm" onClick={createRoom.open}>
              <Icon name="plus" />
              Create a room
            </Button>
          }
        >
          Open one and share the link with your study group. Rooms opened by people you follow will show up
          here first.
        </EmptyState>
      </div>
    </section>
  );
}
