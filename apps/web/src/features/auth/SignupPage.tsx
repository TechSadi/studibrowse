import { Link, useLocation } from 'react-router';
import { signupSchema } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { CheckLine } from '../../components/ui/CheckLine';
import { FormError, PasswordField, TextField, type HintTone } from '../../components/ui/Field';
import { authApi } from '../../lib/api';
import { useAuth } from './AuthContext';
import styles from './authForm.module.css';
import { AuthShell } from './AuthShell';
import { GoogleButton } from './GoogleButton';
import { PasswordMeter } from './PasswordMeter';
import { passwordHint } from './passwordStrength';
import { useAuthForm } from './useAuthForm';
import { useUsernameAvailability, type UsernameAvailability } from './useUsernameAvailability';

const DEFAULT_USERNAME_HINT = 'Shown to people in rooms';

/** Usernames are stored lowercase and may only use letters, numbers and underscores. */
function cleanUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function usernameHint(username: string, check: UsernameAvailability): { text: string; tone: HintTone } {
  switch (check.status) {
    case 'checking':
      return { text: `Checking @${username}…`, tone: 'muted' };
    case 'available':
      return { text: `@${username} is available`, tone: 'ok' };
    case 'taken':
      return { text: `@${username} is taken`, tone: 'error' };
    case 'invalid':
      return { text: check.message, tone: 'error' };
    default:
      return { text: DEFAULT_USERNAME_HINT, tone: 'muted' };
  }
}

export function SignupPage() {
  const { signIn } = useAuth();
  // Keep ?next= (e.g. from an invite link) when switching between Sign up and Log in.
  const { search } = useLocation();
  const form = useAuthForm({
    formId: 'signup',
    schema: signupSchema,
    initialValues: { name: '', username: '', email: '', password: '', acceptTerms: false },
    fieldByCode: { EMAIL_TAKEN: 'email', USERNAME_TAKEN: 'username' },
  });
  const { values, errors, setValue, fieldId } = form;
  const availability = useUsernameAvailability(values.username);
  const userHint = usernameHint(values.username, availability);
  const pwHint = passwordHint(values.password);

  const onSubmit = form.handleSubmit(async (v) => {
    signIn(await authApi.signup({ ...v, acceptTerms: true, keepLoggedIn: true }));
  });

  return (
    <AuthShell title="Sign up" switchTo="login">
      <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="signup-title">
        <div>
          <h1 id="signup-title">Create your account</h1>
          <p className={styles.sub}>You need an account to join rooms. It&apos;s free.</p>
        </div>
        <GoogleButton />
        <div className={styles.or}>or with email</div>
        <div className={styles.grid2}>
          <TextField
            id={fieldId('name')}
            label="Full name"
            autoComplete="name"
            placeholder="Alex Smith"
            value={values.name}
            onChange={(e) => setValue('name', e.target.value)}
            error={errors.name}
          />
          <TextField
            id={fieldId('username')}
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="alexsmith"
            value={values.username}
            onChange={(e) => setValue('username', cleanUsername(e.target.value))}
            error={errors.username}
            hint={userHint.text}
            hintTone={userHint.tone}
            liveHint
          />
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
        <PasswordField
          id={fieldId('password')}
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={values.password}
          onChange={(e) => setValue('password', e.target.value)}
          error={errors.password}
          below={<PasswordMeter password={values.password} />}
          hint={pwHint.text}
          hintTone={pwHint.ok ? 'ok' : 'muted'}
        />
        <CheckLine
          id={fieldId('acceptTerms')}
          checked={values.acceptTerms}
          onChange={(checked) => setValue('acceptTerms', checked)}
          error={errors.acceptTerms}
        >
          I agree to the <strong>Terms</strong> and <strong>Privacy Policy</strong>.
        </CheckLine>
        <FormError>{form.formError}</FormError>
        <Button type="submit" block disabled={form.pending}>
          {form.pending ? 'Creating account…' : 'Create account'}
        </Button>
        <p className={styles.footNote}>
          Already have an account?{' '}
          <Link className="text-link" to={{ pathname: '/login', search }}>
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
