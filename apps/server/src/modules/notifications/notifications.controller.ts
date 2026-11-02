import type { RequestHandler } from 'express';
import type {
  MarkReadData,
  NotificationsQuery,
  NotificationsResponse,
  UnreadCountResponse,
} from '@studibrowse/shared';
import * as notificationsService from './notifications.service';

// requireAuth runs before every handler, so userId is set.

export const list: RequestHandler<Record<string, string>, NotificationsResponse> = async (req, res) => {
  // validateQuery replaced req.query with the parsed value, which Express's string-only query type can't describe.
  res.json(
    await notificationsService.listNotifications(req.userId!, req.query as unknown as NotificationsQuery),
  );
};

export const unreadCount: RequestHandler<Record<string, string>, UnreadCountResponse> = async (req, res) => {
  res.json({ count: await notificationsService.countUnread(req.userId!) });
};

export const markRead: RequestHandler<Record<string, string>, UnreadCountResponse, MarkReadData> = async (
  req,
  res,
) => {
  res.json({ count: await notificationsService.markRead(req.userId!, req.body) });
};
