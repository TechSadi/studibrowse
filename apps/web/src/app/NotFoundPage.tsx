import { PlaceholderScreen } from '../components/layout/PlaceholderScreen';
import { ButtonLink } from '../components/ui/Button';
import { useAuth } from '../features/auth/AuthContext';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  return (
    <PlaceholderScreen title="Page not found">
      <div className={`${styles.code} num`} aria-hidden="true">
        404
      </div>
      <p>That link doesn&apos;t go anywhere. It may have been mistyped, or the page has moved.</p>
      <ButtonLink to={signedIn ? '/home' : '/'}>{signedIn ? 'Back to Home' : 'Go to StudiBrowse'}</ButtonLink>
    </PlaceholderScreen>
  );
}
