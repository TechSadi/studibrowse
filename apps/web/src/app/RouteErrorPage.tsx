import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { PlaceholderScreen } from '../components/layout/PlaceholderScreen';
import { Button } from '../components/ui/Button';
import { reportError } from '../lib/errorTracking';

/**
 * The router's error boundary: a screen threw while rendering, or its code couldn't be downloaded (usually a tab
 * left open across a deploy, which a reload fixes). Without it React Router shows its developer error page and
 * the error never reaches Sentry.
 */
export function RouteErrorPage() {
  const error = useRouteError();

  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <PlaceholderScreen title="Something went wrong">
      <p>This page hit a problem and couldn&apos;t load. Reloading usually fixes it.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </PlaceholderScreen>
  );
}
