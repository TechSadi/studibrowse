import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useSocketEvent } from '../../hooks/useSocket';
import { showBrowserNotification } from '../../lib/browserNotifications';
import { receiveNotification } from './queries';

/**
 * Mounted once for every signed-in page, the focus room included: keeps the bell current and, while the tab
 * is hidden, shows a browser notification (if you enabled them).
 */
export function NotificationListener() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useSocketEvent('notification:new', ({ notification }) => {
    receiveNotification(queryClient, notification);
    showBrowserNotification({
      tag: notification.id,
      title: notification.text,
      body: notification.roomName,
      onClick: () =>
        navigate(notification.type === 'roomStarted' ? `/room/${notification.roomId}` : '/notifications'),
    });
  });

  return null;
}
