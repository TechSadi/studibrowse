import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { progressApi, sessionsApi } from '../../lib/api';

const PROGRESS_KEY = ['progress'] as const;
const MY_SESSIONS_KEY = ['sessions', 'mine'] as const;

/** This week's progress. One query shared by the sidebar streak card, Home and Progress. */
export function useProgressSummary() {
  return useQuery({ queryKey: [...PROGRESS_KEY, 'summary', 'week'], queryFn: progressApi.summary });
}

/** One page of your session history. Keeps the last page on screen while the next one loads. */
export function useMySessions(cursor: string | undefined, limit: number) {
  return useQuery({
    queryKey: [...MY_SESSIONS_KEY, { cursor, limit }],
    queryFn: () => sessionsApi.mine({ cursor, limit }),
    placeholderData: keepPreviousData,
  });
}

/** A session was just saved: progress and history are out of date everywhere. */
export function invalidateProgress(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: PROGRESS_KEY });
  void queryClient.invalidateQueries({ queryKey: MY_SESSIONS_KEY });
}
