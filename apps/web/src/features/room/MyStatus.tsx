import { useEffect, useRef, useState } from 'react';
import { MEMBER_STATUSES, WORKING_ON_MAX, type MemberStatus, type PresenceMember } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { useToast } from '../../components/ui/Toast';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { onRadioKeyDown } from '../../lib/radioGroup';
import { emitWithAck } from '../../lib/socket';
import styles from './MyStatus.module.css';
import { STATUS_LABELS } from './people';

/** How long typing pauses before the note is sent to the room. */
const NOTE_DEBOUNCE_MS = 800;

interface MyStatusProps {
  roomId: string;
  me: PresenceMember;
}

/** Your "working on" note and Focusing / Break / Away (mockup `.my-status`). */
export function MyStatus({ roomId, me }: MyStatusProps) {
  const toast = useToast();
  const [note, setNote] = useState(me.workingOn);
  const editing = useRef(false);
  const sentNote = useRef(me.workingOn);

  // Follow the server (another tab, or a rejoin) unless you're typing.
  useEffect(() => {
    sentNote.current = me.workingOn;
    if (!editing.current) setNote(me.workingOn);
  }, [me.workingOn]);

  async function update(change: { status?: MemberStatus; workingOn?: string }) {
    try {
      await emitWithAck('status:set', { roomId, ...change });
    } catch (err) {
      toast({
        icon: 'x',
        title: 'Your status didn’t update',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }

  function sendNote(value: string) {
    const workingOn = value.trim();
    if (workingOn === sentNote.current) return;
    sentNote.current = workingOn;
    void update({ workingOn });
  }

  // Sends the note once typing pauses, and on blur or Enter.
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pause.current), []);

  const selected = MEMBER_STATUSES.indexOf(me.status);
  const select = (index: number) => {
    const status = MEMBER_STATUSES[index];
    if (status && status !== me.status) void update({ status });
  };

  return (
    <div className={styles.card}>
      <Avatar initials={initialsOf(me.name)} tone={avatarTone(me.avatarColor)} />
      <div className={styles.grow}>
        <label htmlFor="working-on">You’re working on</label>
        <input
          id="working-on"
          value={note}
          maxLength={WORKING_ON_MAX}
          placeholder="Add a short note, e.g. Problem set 6"
          autoComplete="off"
          onFocus={() => (editing.current = true)}
          onChange={(event) => {
            const { value } = event.target;
            setNote(value);
            clearTimeout(pause.current);
            pause.current = setTimeout(() => sendNote(value), NOTE_DEBOUNCE_MS);
          }}
          onBlur={() => {
            editing.current = false;
            clearTimeout(pause.current);
            sendNote(note);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      <div className={styles.seg} role="radiogroup" aria-label="Your status">
        {MEMBER_STATUSES.map((status, index) => {
          const on = index === selected;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={on ? styles.on : undefined}
              onClick={() => select(index)}
              onKeyDown={(event) => onRadioKeyDown(event, index, MEMBER_STATUSES.length, select)}
            >
              <span className={`${styles.sdot} ${styles[status]}`} />
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
