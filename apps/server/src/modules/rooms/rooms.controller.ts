import type { RequestHandler } from 'express';
import type {
  CreateRoomData,
  CreateRoomResponse,
  InviteCodeParams,
  InvitePreviewResponse,
  PublicRoomsQuery,
  PublicRoomsResponse,
  RoomIdParams,
  RoomResponse,
} from '@studibrowse/shared';
import * as roomsService from './rooms.service';

// requireAuth runs before every handler except invitePreview, so userId is set.

const listPublic: RequestHandler<Record<string, string>, PublicRoomsResponse> = async (req, res) => {
  // validateQuery replaced req.query with the parsed value, which Express's string-only query type can't describe.
  const query = req.query as unknown as PublicRoomsQuery;
  res.json(await roomsService.listPublicRooms(req.userId!, query));
};

const getById: RequestHandler<RoomIdParams, RoomResponse> = async (req, res) => {
  res.json({ room: await roomsService.getRoom(req.userId!, req.params.id) });
};

const invitePreview: RequestHandler<InviteCodeParams, InvitePreviewResponse> = async (req, res) => {
  res.json(await roomsService.getInvitePreview(req.params.code));
};

export function createRoomsController({ onRoomCreated }: { onRoomCreated?: (roomId: string) => void }) {
  const create: RequestHandler<Record<string, string>, CreateRoomResponse, CreateRoomData> = async (
    req,
    res,
  ) => {
    const room = await roomsService.createRoom(req.userId!, req.body);
    res.status(201).json({ room });
    onRoomCreated?.(room.id);
  };

  return { create, listPublic, getById, invitePreview };
}
