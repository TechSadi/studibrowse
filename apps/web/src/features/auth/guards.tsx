import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useAuth } from './AuthContext';
import styles from './guards.module.css';
import { loginPathFor, resolveSignedInPath } from './redirects';

/** Shown while the session is restored on load, so public and private pages don't flash. */
function SessionLoader() {
  return (
    <div className={styles.loader} role="status">
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Wraps pages for signed-out visitors (Welcome, Sign up, Log in, Forgot password). */
export function PublicOnlyRoute() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  if (state.status === 'loading') return <SessionLoader />;
  if (state.status === 'signedIn') {
    return <Navigate to={resolveSignedInPath(state.user, params.get('next'))} replace />;
  }
  return <Outlet />;
}

/** Wraps pages that need an account. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <SessionLoader />;
  if (state.status === 'signedOut') {
    // After choosing to log out, go to Welcome rather than "log in to continue".
    return <Navigate to={state.loggedOut ? '/' : loginPathFor(location)} replace />;
  }
  return <Outlet />;
}
