import { Link } from 'react-router';
import { loginSchema } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { CheckLine } from '../../components/ui/CheckLine';
import { FormError, PasswordField, TextField } from '../../components/ui/Field';
import { authApi } from '../../lib/api';
import { useAuth } from './AuthContext';
import styles from './authForm.module.css';
import { AuthShell } from './AuthShell';
import { GoogleButton } from './GoogleButton';
import { useAuthForm } from './useAuthForm';

export function LoginPage() {
  const { signIn } = useAuth();
  // "Keep me logged in" starts off on Log in (shared computers); see docs/ARCHITECTURE.md.
  const form = useAuthForm({
    formId: 'login',
    schema: loginSchema,
    initialValues: { identifier: '', password: '', keepLoggedIn: false },
  });
  const { values, errors, setValue, fieldId } = form;

  // After sign-in the PublicOnlyRoute guard redirects, honouring ?next=.
  const onSubmit = form.handleSubmit(async (v) => {
    signIn(await authApi.login(v));
  });

  return (
    <AuthShell title="Log in" switchTo="signup">
      <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="login-title">
        <div>
          <h1 id="login-title">Welcome back</h1>
          <p className={styles.sub}>Log in to see who&apos;s studying right now.</p>
        </div>
        <GoogleButton />
        <div className={styles.or}>or</div>
        <TextField
          id={fieldId('identifier')}
          label="Email or username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={values.identifier}
          onChange={(e) => setValue('identifier', e.target.value)}
          error={errors.identifier}
        />
        <PasswordField
          id={fieldId('password')}
          label="Password"
          labelAside={
            <Link className={`text-link ${styles.forgotLink}`} to="/forgot-password">
              Forgot password?
            </Link>
          }
          autoComplete="current-password"
          placeholder="Your password"
          value={values.password}
          onChange={(e) => setValue('password', e.target.value)}
          error={errors.password}
        />
        <CheckLine
          id={fieldId('keepLoggedIn')}
          checked={values.keepLoggedIn}
          onChange={(checked) => setValue('keepLoggedIn', checked)}
        >
          Keep me logged in on this device
        </CheckLine>
        <FormError>{form.formError}</FormError>
        <Button type="submit" block disabled={form.pending}>
          {form.pending ? 'Logging in…' : 'Log in'}
        </Button>
        <p className={styles.footNote}>
          New to StudiBrowse?{' '}
          <Link className="text-link" to="/signup">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
