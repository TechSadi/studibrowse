import { useState, type FormEvent } from 'react';
import { deleteAccountSchema } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { FormError, TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { usersApi } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { serverError } from '../auth/formErrors';
import styles from './Settings.module.css';

/** Whether what was typed is the username, the way the server compares it (trimmed, any case). */
export function confirmsUsername(typed: string, username: string): boolean {
  const parsed = deleteAccountSchema.safeParse({ username: typed });
  return parsed.success && parsed.data.username === username;
}

/** Deletes the account once you type your username. Replaces the mockup's "confirm by email". */
export function DeleteAccountDialog({ username, onClose }: { username: string; onClose: () => void }) {
  const { endAfterDeletion } = useAuth();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirmsUsername(typed, username);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await usersApi.deleteMe({ username: typed });
      // The guards send a signed-out visitor to Welcome.
      endAfterDeletion();
      toast({ icon: 'check', title: 'Account deleted', detail: 'Thanks for studying with us.' });
    } catch (err) {
      setBusy(false);
      setError(serverError(err).message);
    }
  };

  return (
    <Modal
      title="Delete your account?"
      subtitle="This removes your profile, your follows and your notifications. Your chat messages stay in their rooms without your name. It can’t be undone."
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      footer={
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!matches || busy}>
            {busy ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>
      }
    >
      <TextField
        id="delete-confirm"
        label={
          <>
            Type <span className="num">{username}</span> to confirm
          </>
        }
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          setError(null);
        }}
      />
      <FormError>{error}</FormError>
    </Modal>
  );
}
