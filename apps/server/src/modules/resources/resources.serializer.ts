import type { Types } from 'mongoose';
import type { ResourceType, RoomResource } from '@studibrowse/shared';

/** A resource as `.lean()` returns it. */
export interface ResourceRecord {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  title: string;
  url: string;
  size: number | null;
  createdAt: Date;
}

export function toRoomResource(resource: ResourceRecord): RoomResource {
  return {
    id: resource._id.toString(),
    roomId: resource.roomId.toString(),
    userId: resource.userId.toString(),
    type: resource.type as ResourceType,
    title: resource.title,
    url: resource.url,
    size: resource.size ?? null,
    createdAt: resource.createdAt.toISOString(),
  };
}
