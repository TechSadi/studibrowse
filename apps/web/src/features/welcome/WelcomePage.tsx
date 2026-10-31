import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@studibrowse/shared';
import { getJson } from '../../lib/api';

/** Placeholder until the Welcome screen is built in Phase 1. Shows the API health to prove the proxy works. */
export function WelcomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => getJson<HealthResponse>('/api/health'),
  });

  return (
    <main>
      <h1>StudiBrowse</h1>
      <p>Study with people, not alone.</p>
      <p role="status">
        {health.isPending && 'Checking server…'}
        {health.isError && 'Server unreachable.'}
        {health.isSuccess && `Server up, database ${health.data.db}.`}
      </p>
    </main>
  );
}
