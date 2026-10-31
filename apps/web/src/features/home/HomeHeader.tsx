import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../auth/AuthContext';
import { formatHomeDate, greetingFor } from './dates';
import styles from './Home.module.css';
import { parseInviteInput } from './invite';
import { useCreateRoomDialog } from './useCreateRoomDialog';

function JoinByLinkForm() {
  const navigate = useNavigate();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const code = parseInviteInput(value);
    if (code) {
      navigate(`/r/${encodeURIComponent(code)}`);
      return;
    }
    setError(
      value.trim()
        ? 'That doesn’t look like an invite link or code. Check it and try again.'
        : 'Paste an invite link or code first.',
    );
  }

  return (
    <div className={styles.join}>
      <form className={styles.joinLink} onSubmit={onSubmit} noValidate>
        <Icon name="link" className={styles.joinIcon} />
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Paste an invite link or code"
          aria-label="Invite link or code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
        />
        <button type="submit">Join</button>
      </form>
      {error ? (
        <p id={errorId} className={styles.err} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function HomeHeader() {
  const { state } = useAuth();
  const createRoom = useCreateRoomDialog();
  const now = new Date();
  const firstName = state.user?.name.trim().split(/\s+/)[0] ?? '';

  return (
    <div className={styles.head}>
      <div>
        <div className="eyebrow">{formatHomeDate(now)}</div>
        <h1>
          {greetingFor(now)}, {firstName}
        </h1>
        <p>Pick a room or open your own, and make the next hour count.</p>
      </div>
      <div className={styles.headActions}>
        <JoinByLinkForm />
        <Button onClick={createRoom.open}>
          <Icon name="plus" />
          Create a room
        </Button>
      </div>
    </div>
  );
}
