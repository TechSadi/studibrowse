import { useState, type FormEvent } from 'react';
import { emailSchema, updateMeSchema, type AvatarColor, type UpdateMeInput } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ColorSwatches } from '../../components/ui/ColorSwatches';
import { FormError, TextField, type HintTone } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { authApi, usersApi } from '../../lib/api';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { useAuth } from '../auth/AuthContext';
import { issuesToFieldErrors, serverError, type FieldErrors } from '../auth/formErrors';
import { useUsernameAvailability, type UsernameAvailability } from '../auth/useUsernameAvailability';
import { ConfirmPasswordDialog } from './ConfirmPasswordDialog';
import { timeAgo } from './format';
import styles from './Settings.module.css';
import { SettingRow, SettingsSection } from './SettingsLayout';
import { useMe, useSaveMe } from './useSaveMe';

type FormField = 'name' | 'username' | 'email' | 'studying';

const FIELD_BY_CODE: Partial<Record<string, FormField>> = {
  USERNAME_TAKEN: 'username',
  EMAIL_TAKEN: 'email',
  EMAIL_MANAGED_BY_GOOGLE: 'email',
};

function usernameHint(check: UsernameAvailability): { text?: string; tone: HintTone } {
  switch (check.status) {
    case 'checking':
      return { text: 'Checking…', tone: 'muted' };
    case 'available':
      return { text: 'Available', tone: 'ok' };
    case 'taken':
      return { text: 'That username is taken.', tone: 'error' };
    case 'invalid':
      return { text: check.message, tone: 'error' };
    default:
      return { tone: 'muted' };
  }
}

export function AccountSection({ id }: { id: string }) {
  const user = useMe();
  const { setUser } = useAuth();
  const save = useSaveMe();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user.name,
    username: user.username,
    email: user.email,
    studying: user.studying,
  });
  const [errors, setErrors] = useState<FieldErrors<FormField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [pickingColour, setPickingColour] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Your own username is always "available", so only check one you're changing to.
  const usernameChanged = form.username.trim().toLowerCase() !== user.username;
  const availability = useUsernameAvailability(usernameChanged ? form.username : '');
  const hint = usernameHint(availability);

  const update = (field: FormField) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError(null);
  };

  /** The profile fields that changed, as PATCH /api/users/me takes them. */
  const profileChanges = (): UpdateMeInput => ({
    ...(form.name.trim() !== user.name && { name: form.name }),
    ...(usernameChanged && { username: form.username }),
    ...(form.studying.trim() !== user.studying && { studying: form.studying }),
  });

  const saveProfile = async (changes: UpdateMeInput): Promise<boolean> => {
    if (Object.keys(changes).length === 0) return true;
    try {
      const { user: updated } = await usersApi.updateMe(changes);
      setUser(updated);
      return true;
    } catch (err) {
      const { field, message } = serverError(err, FIELD_BY_CODE);
      if (field) setErrors((e) => ({ ...e, [field]: message }));
      else setFormError(message);
      return false;
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const changes = profileChanges();
    const nextErrors: FieldErrors<FormField> = {};
    if (Object.keys(changes).length > 0) {
      const parsed = updateMeSchema.safeParse(changes);
      if (!parsed.success) Object.assign(nextErrors, issuesToFieldErrors<FormField>(parsed.error.issues));
    }
    const email = emailSchema.safeParse(form.email);
    if (!email.success) nextErrors.email = email.error.issues[0]?.message;
    if (availability.status === 'taken') nextErrors.username = 'That username is taken.';
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    const emailChanged = email.success && email.data !== user.email;
    if (!emailChanged && Object.keys(changes).length === 0) {
      toast({ icon: 'check', title: 'Nothing to save', detail: 'Your account is up to date.' });
      return;
    }

    setSaving(true);
    const savedProfile = await saveProfile(changes);
    setSaving(false);
    if (!savedProfile) return;
    // A new email needs your password first; the dialog finishes the save.
    if (emailChanged) setConfirmEmail(email.data);
    else toast({ icon: 'check', title: 'Account saved', detail: 'Your profile is up to date.' });
  };

  const changeEmail = async (password: string) => {
    if (!confirmEmail) return null;
    try {
      const { user: updated } = await usersApi.changeEmail({ email: confirmEmail, password });
      setUser(updated);
      setForm((f) => ({ ...f, email: updated.email }));
      setConfirmEmail(null);
      toast({ icon: 'check', title: 'Account saved', detail: `You now sign in with ${updated.email}` });
      return null;
    } catch (err) {
      const { field, message } = serverError(err, { WRONG_PASSWORD: 'password' as const });
      if (field) return { field, message };
      // Not about the password (taken, Google), so it belongs on the email field.
      setConfirmEmail(null);
      setErrors((e) => ({ ...e, email: message }));
      return null;
    }
  };

  const chooseColour = async (avatarColor: AvatarColor) => {
    if (avatarColor === user.avatarColor) return;
    await save({ avatarColor }, { title: 'Avatar colour updated', detail: 'Everyone sees the new colour.' });
  };

  const sendReset = async () => {
    setSendingReset(true);
    try {
      await authApi.forgot({ email: user.email });
      toast({ icon: 'mail', title: 'Password reset email sent', detail: `Check ${user.email}` });
    } catch (err) {
      toast({ icon: 'x', title: 'Couldn’t send the email', detail: serverError(err).message });
    } finally {
      setSendingReset(false);
    }
  };

  const passwordHint = !user.hasPassword
    ? 'You sign in with Google. We’ll email you a link to add a password.'
    : user.passwordChangedAt
      ? `Last changed ${timeAgo(user.passwordChangedAt)}`
      : 'We’ll email you a link to choose a new one';

  return (
    <SettingsSection id={id} title="Account" description="How you appear to other people.">
      <div className={styles.avatar}>
        <Avatar initials={initialsOf(user.name)} tone={avatarTone(user.avatarColor)} size="lg" />
        <div>
          <b id="avatar-colour-label">Profile picture</b>
          <div className={styles.avatarActions}>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={pickingColour}
              aria-controls="avatar-colours"
              onClick={() => setPickingColour((open) => !open)}
            >
              Change colour
            </Button>
          </div>
          {pickingColour ? (
            <div id="avatar-colours" className={styles.swatches}>
              <ColorSwatches
                value={user.avatarColor}
                labelledBy="avatar-colour-label"
                onChange={(color) => void chooseColour(color)}
              />
            </div>
          ) : null}
        </div>
      </div>

      <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        <div className={styles.grid2}>
          <TextField
            id="settings-name"
            label="Full name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => update('name')(e.target.value)}
            error={errors.name}
          />
          <TextField
            id="settings-username"
            label="Username"
            autoComplete="username"
            value={form.username}
            onChange={(e) => update('username')(e.target.value)}
            error={errors.username ?? (hint.tone === 'error' ? hint.text : undefined)}
            hint={hint.tone === 'error' ? undefined : hint.text}
            hintTone={hint.tone}
            liveHint
          />
        </div>
        <TextField
          id="settings-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => update('email')(e.target.value)}
          readOnly={user.googleLinked}
          error={errors.email}
          hint={user.googleLinked ? 'Managed by your Google account' : undefined}
        />
        <TextField
          id="settings-bio"
          label="Bio"
          value={form.studying}
          maxLength={80}
          onChange={(e) => update('studying')(e.target.value)}
          error={errors.studying}
        />
        <SettingRow title="Password" hint={passwordHint} className={styles.passwordRow}>
          <Button variant="ghost" size="sm" disabled={sendingReset} onClick={() => void sendReset()}>
            {sendingReset ? 'Sending…' : user.hasPassword ? 'Change password' : 'Set a password'}
          </Button>
        </SettingRow>
        <FormError>{formError}</FormError>
        <div className={styles.save}>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      {confirmEmail ? (
        <ConfirmPasswordDialog
          email={confirmEmail}
          onConfirm={changeEmail}
          onClose={() => setConfirmEmail(null)}
        />
      ) : null}
    </SettingsSection>
  );
}
