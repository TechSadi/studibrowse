import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AppNotification,
  MarkReadData,
  NotificationFilter,
  UnreadCountResponse,
} from '@studibrowse/shared';
import { notificationsApi } from '../../lib/api';
import { markReadInPages, upsertNotification, type CachedPages } from './notificationList';

const NOTIFICATIONS_KEY = ['notifications'] as const;
const LIST_KEY = [...NOTIFICATIONS_KEY, 'list'] as const;
const UNREAD_KEY = [...NOTIFICATIONS_KEY, 'unread'] as const;

const listKey = (filter: NotificationFilter) => [...LIST_KEY, filter] as const;

/** Your notifications for one tab, newest first, loading older pages on demand. */
export function useNotifications(filter: NotificationFilter, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: listKey(filter),
    queryFn: ({ pageParam }) => notificationsApi.list({ filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** The bell's badge. Kept current by notification:new and by marking read. */
export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: notificationsApi.unreadCount,
    select: (data) => data.count,
  });
}

function eachCachedList(
  queryClient: QueryClient,
  update: (data: CachedPages, filter: NotificationFilter) => CachedPages,
) {
  for (const [key, data] of queryClient.getQueriesData<CachedPages>({ queryKey: LIST_KEY })) {
    if (!data) continue;
    const filter = key[2] as NotificationFilter;
    queryClient.setQueryData<CachedPages>(key, update(data, filter));
  }
}

/** A notification arrived over the socket: show it at the top of every open list and recount. */
export function receiveNotification(queryClient: QueryClient, notification: AppNotification) {
  eachCachedList(queryClient, (data, filter) => upsertNotification(data, notification, filter));
  void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
}

/** Marks one notification (`{ id }`) or all (`{ all: true }`) as read, on screen straight away. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkReadData) => notificationsApi.markRead(input),
    onMutate: (input) => {
      eachCachedList(queryClient, (data) => markReadInPages(data, 'id' in input ? input.id : null));
      if ('all' in input) queryClient.setQueryData<UnreadCountResponse>(UNREAD_KEY, { count: 0 });
    },
    onSuccess: (data) => queryClient.setQueryData<UnreadCountResponse>(UNREAD_KEY, data),
    // The Unread tab drops what was just read, and a failure puts things back as the server has them.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
