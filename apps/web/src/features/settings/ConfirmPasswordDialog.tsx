import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError, PasswordField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import styles from './Settings.module.css';

interface ConfirmPasswordDialogProps {
  email: string;
  /** Runs the change. Resolves to an error for the password field, or null when it worked. */
  onConfirm: (password: string) => Promise<{ field?: 'password'; message: string } | null>;
  onClose: () => void;
}

/** Asks for your current password before the sign-in email changes. Not in the mockup; built on Modal. */
export function ConfirmPasswordDialog({ email, onConfirm, onClose }: ConfirmPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: 'password'; message: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError({ field: 'password', message: 'Enter your password.' });
      return;
    }
    setBusy(true);
    const result = await onConfirm(password);
    setBusy(false);
    if (result) setError(result);
  };

  return (
    <Modal
      title="Confirm it’s you"
      subtitle={
        <>
          Enter your password to sign in with <b>{email}</b> from now on.
        </>
      }
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      footer={
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Change email'}
          </Button>
        </div>
      }
    >
      <PasswordField
        id="confirm-password"
        label="Current password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(null);
        }}
        error={error?.field === 'password' ? error.message : undefined}
      />
      {error && !error.field ? <FormError>{error.message}</FormError> : null}
    </Modal>
  );
}
