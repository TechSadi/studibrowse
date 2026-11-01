import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { resetPasswordSchema } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { FormError, PasswordField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { ApiError, authApi } from '../../lib/api';
import styles from './authForm.module.css';
import { AuthShell } from './AuthShell';
import { PasswordMeter } from './PasswordMeter';
import { passwordHint } from './passwordStrength';
import { useAuthForm } from './useAuthForm';

const INVALID_LINK = 'This reset link is invalid or has expired. Request a new one.';

/**
 * The reset email links to /reset-password#token=… (a fragment, so the token never reaches server logs).
 * Read it once, then drop it from the address bar so it isn't left in history.
 */
function useResetToken(): string {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (!window.location.hash) return;
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, []);
  return token;
}

function InvalidLink() {
  return (
    <div className={styles.stack}>
      <div>
        <h1 id="reset-title">Link expired</h1>
        <p className={styles.sub}>{INVALID_LINK}</p>
      </div>
      <Link className="text-link" to="/forgot-password">
        Request a new link
      </Link>
    </div>
  );
}

export function ResetPasswordPage() {
  const token = useResetToken();
  const navigate = useNavigate();
  const toast = useToast();
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const form = useAuthForm({
    formId: 'reset',
    schema: resetPasswordSchema,
    initialValues: { token, password: '' },
  });
  const { values, errors, setValue, fieldId } = form;
  const hint = passwordHint(values.password);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await authApi.reset(v);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RESET_TOKEN_INVALID') {
        setLinkInvalid(true);
        return;
      }
      throw err;
    }
    toast({ icon: 'check', title: 'Password updated', detail: 'Log in with your new password.' });
    navigate('/login', { replace: true });
  });

  return (
    <AuthShell title="Choose a new password" switchTo="login">
      <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="reset-title">
        {linkInvalid ? (
          <InvalidLink />
        ) : (
          <div className={styles.stack}>
            <div>
              <h1 id="reset-title">Choose a new password</h1>
              <p className={styles.sub}>You&apos;ll use it to log in from now on, on every device.</p>
            </div>
            <PasswordField
              id={fieldId('password')}
              label="New password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={values.password}
              onChange={(e) => setValue('password', e.target.value)}
              error={errors.password}
              below={<PasswordMeter password={values.password} />}
              hint={hint.text}
              hintTone={hint.ok ? 'ok' : 'muted'}
            />
            <FormError>{form.formError}</FormError>
            <Button type="submit" block disabled={form.pending}>
              {form.pending ? 'Saving…' : 'Save new password'}
            </Button>
          </div>
        )}
        <p className={styles.footNote}>
          <Link className="text-link" to="/login">
            Back to log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
