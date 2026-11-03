import { useNavigate } from 'react-router';
import type { NotificationListItem } from '@studibrowse/shared';
import { canJoin } from './notificationList';
import { useMarkRead } from './queries';

/** What clicking a notification does: marks it read and, for a room alert, joins the room. */
export function useOpenNotification(afterOpen?: () => void) {
  const navigate = useNavigate();
  const markRead = useMarkRead();
  return (item: NotificationListItem) => {
    if (!item.read) markRead.mutate({ id: item.id });
    afterOpen?.();
    if (canJoin(item)) navigate(`/room/${item.roomId}`);
  };
}
