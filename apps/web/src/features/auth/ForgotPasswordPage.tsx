import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { forgotPasswordSchema, RESET_TOKEN_TTL_MINS } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { FormError, TextField } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { authApi } from '../../lib/api';
import styles from './authForm.module.css';
import { AuthShell } from './AuthShell';
import { serverError } from './formErrors';
import { useAuthForm } from './useAuthForm';

/**
 * Seconds before "Send again" works. A UX limit so people don't hammer the button; the server separately allows
 * only 3 reset emails per hour per address.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Counts down once a second from `RESEND_COOLDOWN_SECONDS`, starting now and again on each `restart`. */
function useCooldown() {
  const [endsAt, setEndsAt] = useState<number | null>(() => Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const restart = () => {
    const start = Date.now();
    setNow(start);
    setEndsAt(start + RESEND_COOLDOWN_SECONDS * 1000);
  };
  return { remaining, restart };
}

function SentState({ email }: { email: string }) {
  const toast = useToast();
  const cooldown = useCooldown();
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await authApi.forgot({ email });
      toast({ icon: 'mail', title: 'Reset link sent again', detail: email });
      cooldown.restart();
    } catch (err) {
      setError(serverError(err).message);
    } finally {
      setResending(false);
    }
  }

  const waiting = cooldown.remaining > 0;
  return (
    <div className={styles.sent}>
      <span className={styles.sentIcon}>
        <Icon name="mail" />
      </span>
      <h1 id="forgot-title" tabIndex={-1}>
        Check your inbox
      </h1>
      <p className={styles.sub}>
        We sent a reset link to <b>{email}</b>. It expires in {RESET_TOKEN_TTL_MINS} minutes.
      </p>
      <Button variant="ghost" block onClick={resend} disabled={waiting || resending}>
        {waiting ? (
          <>
            Send again in <span className="num">{formatCountdown(cooldown.remaining)}</span>
          </>
        ) : resending ? (
          'Sending…'
        ) : (
          'Didn’t get it? Send again'
        )}
      </Button>
      <FormError>{error}</FormError>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useAuthForm({
    formId: 'forgot',
    schema: forgotPasswordSchema,
    initialValues: { email: '' },
  });
  const { values, errors, setValue, fieldId } = form;

  const onSubmit = form.handleSubmit(async (v) => {
    await authApi.forgot(v);
    setSentTo(v.email.trim());
  });

  // Move focus to the new heading so keyboard and screen reader users notice the change.
  useEffect(() => {
    if (sentTo) document.getElementById('forgot-title')?.focus();
  }, [sentTo]);

  return (
    <AuthShell title="Reset your password" switchTo="signup">
      <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="forgot-title">
        {sentTo ? (
          <SentState email={sentTo} />
        ) : (
          <div className={styles.stack}>
            <div>
              <h1 id="forgot-title">Reset your password</h1>
              <p className={styles.sub}>
                Enter the email you signed up with and we&apos;ll send you a reset link.
              </p>
            </div>
            <TextField
              id={fieldId('email')}
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={(e) => setValue('email', e.target.value)}
              error={errors.email}
            />
            <FormError>{form.formError}</FormError>
            <Button type="submit" block disabled={form.pending}>
              {form.pending ? 'Sending…' : 'Send reset link'}
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
