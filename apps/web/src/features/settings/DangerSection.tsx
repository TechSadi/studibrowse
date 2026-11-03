import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { serverError } from '../auth/formErrors';
import { LogoutButton } from '../auth/LogoutButton';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import styles from './Settings.module.css';
import { SettingRow, SettingsSection } from './SettingsLayout';
import { useMe } from './useSaveMe';

export function DangerSection({ id }: { id: string }) {
  const user = useMe();
  const { logoutAll } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState<'logoutAll' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmLogoutAll = async () => {
    setBusy(true);
    try {
      await logoutAll();
      toast({ icon: 'exit', title: 'Logged out everywhere', detail: 'Every device needs to log in again.' });
    } catch (err) {
      setBusy(false);
      setDialog(null);
      toast({ icon: 'x', title: 'Couldn’t log out everywhere', detail: serverError(err).message });
    }
  };

  return (
    <SettingsSection
      id={id}
      title="Log out and delete"
      description="Deleting your account removes your profile, follows and notifications. It can’t be undone."
      danger
    >
      <SettingRow title="Log out" hint="On this device">
        <LogoutButton size="sm" />
      </SettingRow>
      <SettingRow title="Log out of all devices" hint="Including this one">
        <Button variant="ghost" size="sm" onClick={() => setDialog('logoutAll')}>
          Log out everywhere
        </Button>
      </SettingRow>
      <SettingRow title="Delete account" hint="You’ll type your username to confirm">
        <Button variant="danger" size="sm" className={styles.dangerBtn} onClick={() => setDialog('delete')}>
          Delete account
        </Button>
      </SettingRow>

      {dialog === 'logoutAll' ? (
        <ConfirmDialog
          title="Log out of all devices?"
          confirmLabel="Log out everywhere"
          busyLabel="Logging out…"
          busy={busy}
          onConfirm={() => void confirmLogoutAll()}
          onClose={() => setDialog(null)}
        >
          You’ll be logged out here and on every other phone, tablet and computer. Other devices can take up
          to 15 minutes to notice.
        </ConfirmDialog>
      ) : null}
      {dialog === 'delete' ? (
        <DeleteAccountDialog username={user.username} onClose={() => setDialog(null)} />
      ) : null}
    </SettingsSection>
  );
}
