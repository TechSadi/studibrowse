import type { AppNotification, NotificationListItem } from '@studibrowse/shared';
import type { NotificationRecord } from './notification.model';

export function toAppNotification(record: NotificationRecord): AppNotification {
  return {
    id: record._id.toString(),
    type: record.type,
    roomId: record.roomId.toString(),
    roomName: record.roomName,
    text: record.text,
    read: record.read,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toListItem(record: NotificationRecord, roomOpen: boolean): NotificationListItem {
  return { ...toAppNotification(record), roomOpen };
}
