import { afterEach, describe, expect, it } from 'vitest';
import { addMember, countMembers, fullRoomIds, removeMember, resetPresence } from './presence';

afterEach(resetPresence);

describe('presence', () => {
  it('reports 0 members for a room nobody has joined', () => {
    expect(countMembers('room-1')).toBe(0);
    expect(fullRoomIds()).toEqual([]);
  });

  it('counts each person once', () => {
    addMember('room-1', 'maya', 20);
    addMember('room-1', 'maya', 20);
    addMember('room-1', 'jordan', 20);
    expect(countMembers('room-1')).toBe(2);
    removeMember('room-1', 'maya');
    expect(countMembers('room-1')).toBe(1);
  });

  it('lists rooms that are at capacity', () => {
    addMember('room-1', 'maya', 2);
    addMember('room-1', 'jordan', 2);
    addMember('room-2', 'alex', 2);
    expect(fullRoomIds()).toEqual(['room-1']);
    removeMember('room-1', 'jordan');
    expect(fullRoomIds()).toEqual([]);
  });

  it('forgets a room once its last member leaves', () => {
    addMember('room-1', 'maya', 2);
    removeMember('room-1', 'maya');
    removeMember('room-1', 'maya');
    expect(countMembers('room-1')).toBe(0);
  });
});
