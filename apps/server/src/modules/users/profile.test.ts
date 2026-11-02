import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CreateRoomInput, FollowListResponse, UserProfile } from '@studibrowse/shared';
import { createApp } from '../../app';
import { addSocket, resetPresence } from '../../realtime/presence';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Session } from '../sessions/session.model';
import { User, type UserDocument } from './user.model';

useTestDatabase();
afterEach(resetPresence);

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

const onboarded = { onboardedAt: new Date('2026-03-01T00:00:00Z') };

function getProfile(token: string, username: string) {
  return request(app).get(`/api/users/${username}`).set('Authorization', `Bearer ${token}`);
}

async function profileOf(token: string, username: string): Promise<UserProfile> {
  const res = await getProfile(token, username);
  expect(res.status).toBe(200);
  return res.body.profile as UserProfile;
}

function list(token: string, username: string, kind: 'followers' | 'following', query: object = {}) {
  return request(app)
    .get(`/api/users/${username}/${kind}`)
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

async function createRoom(token: string, overrides: Partial<CreateRoomInput> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Late-night exam grind',
      subject: 'Pharmacology',
      isPublic: true,
      maxSize: 20,
      timerSettings: {
        focusMins: 25,
        shortBreakMins: 5,
        longBreakMins: 15,
        roundsBeforeLong: 4,
        totalRounds: 4,
        autoStart: false,
      },
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.room.id as string;
}

function enter(roomId: string, user: UserDocument, hostId: string): void {
  addSocket(roomId, `socket-${user.id}-${roomId}`, {
    userId: user.id as string,
    profile: { name: user.name, username: user.username, avatarColor: 'green' },
    status: 'focusing',
    maxSize: 20,
    hostId,
    now: new Date(),
  });
}

async function logSession(
  roomId: string,
  roomName: string,
  people: { user: UserDocument; mins: number }[],
  startedAt = new Date(),
) {
  await Session.create({
    roomId,
    roomName,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
    participants: people.map(({ user, mins }) => ({ userId: user._id, focusedMins: mins })),
  });
}

describe('GET /api/users/:username', () => {
  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/users/mayak')).status).toBe(401);
  });

  it('answers 404 for someone who does not exist or has not finished onboarding', async () => {
    const { token } = await createUserWithToken(onboarded);
    await createUserWithToken({ username: 'halfway' });
    for (const username of ['nobody', 'halfway']) {
      const res = await getProfile(token, username);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    }
  });

  it('rejects a malformed username', async () => {
    const { token } = await createUserWithToken(onboarded);
    expect((await getProfile(token, 'a')).status).toBe(400);
  });

  it('shows another person’s public fields, counts and whether you follow them', async () => {
    const { user: maya } = await createUserWithToken({
      ...onboarded,
      name: 'Maya Kapoor',
      username: 'mayak',
      studying: 'Pharmacy, year 3',
      subjects: ['Pharmacology'],
      streak: { current: 4, longest: 9 },
      lastStudiedAt: new Date(),
    });
    const { user: viewer, token } = await createUserWithToken({ ...onboarded, following: [maya._id] });
    await createUserWithToken({ ...onboarded, following: [maya._id] });
    await User.updateOne({ _id: maya._id }, { following: [viewer._id, new Types.ObjectId()] });

    const profile = await profileOf(token, 'MayaK');
    expect(profile).toMatchObject({
      id: maya.id,
      name: 'Maya Kapoor',
      username: 'mayak',
      studying: 'Pharmacy, year 3',
      subjects: ['Pharmacology'],
      followerCount: 2,
      // The deleted account doesn't count.
      followingCount: 1,
      isFollowing: true,
      isMe: false,
      stats: { focusMinsThisMonth: 0, streak: 4, roomsHosted: 0 },
      hostingNow: null,
      recentRooms: [],
      studiedTogether: 0,
    });
    expect(JSON.stringify(profile)).not.toContain('@example.com');
  });

  it('hides stats and the studying line when their privacy settings say so, except from themselves', async () => {
    const { token: mayaToken } = await createUserWithToken({
      ...onboarded,
      username: 'mayak',
      studying: 'Pharmacy, year 3',
      privacy: { showStats: false, showStudying: false },
    });
    const { token } = await createUserWithToken(onboarded);

    expect(await profileOf(token, 'mayak')).toMatchObject({ stats: null, studying: '' });
    expect(await profileOf(mayaToken, 'mayak')).toMatchObject({
      isMe: true,
      studying: 'Pharmacy, year 3',
      stats: { focusMinsThisMonth: 0, streak: 0, roomsHosted: 0 },
      studiedTogether: null,
    });
  });

  it('counts focus this month and rooms hosted', async () => {
    const { user: maya, token: mayaToken } = await createUserWithToken({ ...onboarded, username: 'mayak' });
    const { token } = await createUserWithToken(onboarded);
    const roomId = await createRoom(mayaToken);
    await logSession(roomId, 'Late-night exam grind', [{ user: maya, mins: 50 }]);
    await logSession(roomId, 'Late-night exam grind', [{ user: maya, mins: 25 }]);
    await logSession(roomId, 'Older', [{ user: maya, mins: 300 }], new Date(Date.now() - 70 * 86_400_000));

    expect((await profileOf(token, 'mayak')).stats).toEqual({
      focusMinsThisMonth: 75,
      streak: 0,
      roomsHosted: 1,
    });
  });

  describe('hosting now', () => {
    it('shows a live public room they host', async () => {
      const { user: maya, token: mayaToken } = await createUserWithToken({ ...onboarded, username: 'mayak' });
      const { token } = await createUserWithToken(onboarded);
      const roomId = await createRoom(mayaToken);
      expect((await profileOf(token, 'mayak')).hostingNow).toBeNull();

      enter(roomId, maya, maya.id as string);
      expect((await profileOf(token, 'mayak')).hostingNow).toMatchObject({
        id: roomId,
        name: 'Late-night exam grind',
        memberCount: 1,
        isLive: true,
      });
    });

    it('shows a private room only to its host and the people in it', async () => {
      const { user: maya, token: mayaToken } = await createUserWithToken({ ...onboarded, username: 'mayak' });
      const { token: strangerToken } = await createUserWithToken(onboarded);
      const { user: member, token: memberToken } = await createUserWithToken(onboarded);
      const roomId = await createRoom(mayaToken, { isPublic: false });
      enter(roomId, maya, maya.id as string);
      enter(roomId, member, maya.id as string);

      expect((await profileOf(strangerToken, 'mayak')).hostingNow).toBeNull();
      expect((await profileOf(memberToken, 'mayak')).hostingNow?.id).toBe(roomId);
      expect((await profileOf(mayaToken, 'mayak')).hostingNow?.id).toBe(roomId);
    });
  });

  describe('recent rooms', () => {
    it('lists one row per room, newest first, hosted or joined', async () => {
      const { user: maya, token: mayaToken } = await createUserWithToken({ ...onboarded, username: 'mayak' });
      const { user: alex, token: alexToken } = await createUserWithToken({
        ...onboarded,
        name: 'Alex Smith',
      });
      const { token } = await createUserWithToken(onboarded);
      const mine = await createRoom(mayaToken, { name: 'Pharmacology flashcards' });
      const alexs = await createRoom(alexToken, { name: 'Finals week focus' });
      const hour = 60 * 60 * 1000;
      await logSession(
        mine,
        'Pharmacology flashcards',
        [{ user: maya, mins: 25 }],
        new Date(Date.now() - 3 * hour),
      );
      await logSession(
        alexs,
        'Finals week focus',
        [
          { user: maya, mins: 40 },
          { user: alex, mins: 50 },
        ],
        new Date(Date.now() - 2 * hour),
      );
      await logSession(
        mine,
        'Pharmacology flashcards',
        [{ user: maya, mins: 30 }],
        new Date(Date.now() - hour),
      );

      const { recentRooms } = await profileOf(token, 'mayak');
      expect(recentRooms).toEqual([
        expect.objectContaining({
          roomId: mine,
          name: 'Pharmacology flashcards',
          role: 'hosted',
          hostName: null,
          people: 1,
          focusedMins: 30,
          inProgress: false,
        }),
        expect.objectContaining({
          roomId: alexs,
          role: 'joined',
          hostName: 'Alex',
          people: 2,
          focusedMins: 40,
        }),
      ]);
    });

    it('leaves out private rooms the viewer wasn’t in, and counts rooms you shared', async () => {
      const { user: maya, token: mayaToken } = await createUserWithToken({ ...onboarded, username: 'mayak' });
      const { token: strangerToken } = await createUserWithToken(onboarded);
      const { user: friend, token: friendToken } = await createUserWithToken(onboarded);
      const secret = await createRoom(mayaToken, { name: 'Secret', isPublic: false });
      await logSession(secret, 'Secret', [
        { user: maya, mins: 25 },
        { user: friend, mins: 25 },
      ]);

      expect((await profileOf(strangerToken, 'mayak')).recentRooms).toEqual([]);
      const seenByFriend = await profileOf(friendToken, 'mayak');
      expect(seenByFriend.recentRooms.map((room) => room.name)).toEqual(['Secret']);
      expect(seenByFriend.studiedTogether).toBe(1);
      expect((await profileOf(mayaToken, 'mayak')).recentRooms).toHaveLength(1);
    });
  });
});

describe('GET /api/users/:username/followers and /following', () => {
  it('pages through followers, newest accounts first, saying which ones you follow', async () => {
    const { user: maya } = await createUserWithToken({ ...onboarded, username: 'mayak' });
    const followers: UserDocument[] = [];
    for (let i = 0; i < 3; i += 1) {
      followers.push((await createUserWithToken({ ...onboarded, following: [maya._id] })).user);
    }
    const { token } = await createUserWithToken({ ...onboarded, following: [followers[0]!._id] });

    const first = await list(token, 'mayak', 'followers', { limit: 2 });
    expect(first.status).toBe(200);
    const page1 = first.body as FollowListResponse;
    expect(page1.users.map((user) => user.id)).toEqual([followers[2]!.id, followers[1]!.id]);
    expect(page1.nextCursor).toEqual(expect.any(String));

    const page2 = (await list(token, 'mayak', 'followers', { limit: 2, cursor: page1.nextCursor }))
      .body as FollowListResponse;
    expect(page2.users).toEqual([expect.objectContaining({ id: followers[0]!.id, isFollowing: true })]);
    expect(page2.nextCursor).toBeNull();
  });

  it('pages through who they follow, most recently followed first, leaving deleted accounts out', async () => {
    const people: UserDocument[] = [];
    for (let i = 0; i < 3; i += 1) people.push((await createUserWithToken(onboarded)).user);
    const ids = [people[0]!._id, new Types.ObjectId(), people[1]!._id, people[2]!._id];
    await createUserWithToken({ ...onboarded, username: 'mayak', following: ids });
    const { token } = await createUserWithToken(onboarded);

    const page1 = (await list(token, 'mayak', 'following', { limit: 2 })).body as FollowListResponse;
    expect(page1.users.map((user) => user.id)).toEqual([people[2]!.id, people[1]!.id]);
    const page2 = (await list(token, 'mayak', 'following', { limit: 2, cursor: page1.nextCursor }))
      .body as FollowListResponse;
    expect(page2.users.map((user) => user.id)).toEqual([people[0]!.id]);
    expect(page2.nextCursor).toBeNull();
  });

  it('hides a studying line their privacy settings hide', async () => {
    const { user: maya } = await createUserWithToken({ ...onboarded, username: 'mayak' });
    await createUserWithToken({
      ...onboarded,
      studying: 'Law',
      privacy: { showStudying: false },
      following: [maya._id],
    });
    const { token } = await createUserWithToken(onboarded);
    const { users } = (await list(token, 'mayak', 'followers')).body as FollowListResponse;
    expect(users[0]?.studying).toBe('');
  });

  it.each(['followers', 'following'] as const)('rejects a %s cursor we didn’t make', async (kind) => {
    await createUserWithToken({ ...onboarded, username: 'mayak' });
    const { token } = await createUserWithToken(onboarded);
    const res = await list(token, 'mayak', kind, { cursor: 'nonsense' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 404 for an unknown person', async () => {
    const { token } = await createUserWithToken(onboarded);
    expect((await list(token, 'nobody', 'followers')).status).toBe(404);
  });
});

describe('PATCH /api/users/me privacy', () => {
  it('merges privacy settings one field at a time', async () => {
    const { token } = await createUserWithToken(onboarded);
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ privacy: { showStats: false } });
    expect(res.status).toBe(200);
    expect(res.body.user.privacy).toEqual({ showStats: false, showStudying: true });
  });
});
