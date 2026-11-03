import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { ProfileRecentRoom, ProfileStats, RoomSummary, UserProfile } from '@studibrowse/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormError } from '../../components/ui/Field';
import { FollowButton } from '../../components/ui/FollowButton';
import { Icon } from '../../components/ui/Icon';
import { LiveTag } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useNow } from '../../hooks/useNow';
import { useSocket, useSocketEvent } from '../../hooks/useSocket';
import { ApiError } from '../../lib/api';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { useAuth } from '../auth/AuthContext';
import { useFollowToggle } from '../follows/useFollowToggle';
import { holdLobby } from '../home/useLiveRooms';
import { formatMins } from '../rooms/timerText';
import { FollowListModal } from './FollowListModal';
import { firstName, hostingDetail, hoursText, profileSubtitle, recentRoomMeta, togetherText } from './format';
import styles from './Profile.module.css';
import { profileKey, useProfile, type FollowListKind } from './queries';
import { profileUrl, shareProfile } from './shareProfile';

/** The hosting card's "18 min left" only needs to move once a minute or so. */
const CLOCK_MS = 15_000;

function BackLink() {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened straight from a link: there's nothing in this tab to go back to.
  const hasHistory = location.key !== 'default';
  return (
    <div className={styles.back}>
      <button
        type="button"
        className="text-link"
        onClick={() => (hasHistory ? void navigate(-1) : void navigate('/home'))}
      >
        <Icon name="left" /> Back
      </button>
    </div>
  );
}

function HostingNow({ room }: { room: RoomSummary }) {
  const now = useNow(CLOCK_MS);
  return (
    <section className={styles.hosting} aria-label="Hosting now">
      <LiveTag />
      <div className={styles.grow}>
        <b>Hosting {room.name}</b>
        <small>{hostingDetail(room, now)}</small>
      </div>
      <ButtonLink to={`/room/${room.id}`} aria-label={`Join ${room.name}`}>
        Join room
        <Icon name="arrow" />
      </ButtonLink>
    </section>
  );
}

function Stats({ stats }: { stats: ProfileStats }) {
  return (
    <div className={styles.stats}>
      <div>
        <b className="num">{hoursText(stats.focusMinsThisMonth)}</b>
        <span>focused this month</span>
      </div>
      <div>
        <b className={`num ${styles.streak}`}>{stats.streak}</b>
        <span>day streak</span>
      </div>
      <div>
        <b className="num">{stats.roomsHosted}</b>
        <span>rooms hosted</span>
      </div>
    </div>
  );
}

function RecentRooms({ profile }: { profile: UserProfile }) {
  const now = new Date();
  const rooms: ProfileRecentRoom[] = profile.recentRooms;
  return (
    <section className={styles.panel} aria-labelledby="recent-rooms">
      <div className={styles.panelHead}>
        <h2 id="recent-rooms">Recent rooms</h2>
        <p>Rooms {profile.isMe ? 'you' : firstName(profile.name)} hosted or joined</p>
      </div>
      {rooms.length === 0 ? (
        <EmptyState title="No rooms yet">
          {profile.isMe ? 'Rooms you study in' : 'Rooms they study in'} will show up here.
        </EmptyState>
      ) : (
        <ul className={styles.rows}>
          {rooms.map((room) => (
            <li key={room.roomId} className={styles.row}>
              <span className={styles.tile} aria-hidden="true">
                <Icon name="users" />
              </span>
              <div className={styles.rowText}>
                <b>{room.name}</b>
                <small>{recentRoomMeta(room, now)}</small>
              </div>
              <span className={styles.mins}>
                <span className="sr-only">Focused </span>
                {formatMins(room.focusedMins)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function About({ profile }: { profile: UserProfile }) {
  return (
    <section className={`${styles.panel} ${styles.about}`} aria-labelledby="about">
      <h2 id="about">About</h2>
      {profile.studying ? <p>{profile.studying}</p> : <p className="muted">Nothing here yet.</p>}
      {profile.subjects.length > 0 ? (
        <ul className={styles.subjects} aria-label="Subjects">
          {profile.subjects.map((subject) => (
            <li key={subject} className={styles.tag}>
              {subject}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Followers({ profile, onOpen }: { profile: UserProfile; onOpen: (kind: FollowListKind) => void }) {
  const together = togetherText(profile.name, profile.studiedTogether);
  return (
    <section className={styles.panel} aria-label="Followers">
      <div className={styles.counts}>
        <button type="button" className={styles.count} onClick={() => onOpen('followers')}>
          <b className="num">{profile.followerCount}</b> <small>followers</small>
        </button>
        <button type="button" className={styles.count} onClick={() => onOpen('following')}>
          <b className="num">{profile.followingCount}</b> <small>following</small>
        </button>
      </div>
      {together ? <p className={styles.together}>{together}</p> : null}
    </section>
  );
}

function ProfileActions({ profile }: { profile: UserProfile }) {
  const { state } = useAuth();
  const toast = useToast();
  const { toggle, isBusy, error } = useFollowToggle();
  const following = state.user?.following.includes(profile.id) ?? profile.isFollowing;

  async function onShare() {
    const url = profileUrl(profile.username);
    const outcome = await shareProfile(profile.name, url);
    if (outcome === 'copied') toast({ icon: 'link', title: 'Profile link copied', detail: url });
    else if (outcome === 'failed') toast({ icon: 'link', title: 'Couldn’t copy the link', detail: url });
  }

  return (
    <div className={styles.actionsWrap}>
      <div className={styles.actions}>
        {profile.isMe ? (
          <ButtonLink variant="ghost" to="/settings">
            Edit profile
          </ButtonLink>
        ) : (
          <span className={styles.follow}>
            <FollowButton
              name={profile.name}
              following={following}
              disabled={isBusy(profile.id)}
              onToggle={() => toggle(profile.id, !following)}
            />
          </span>
        )}
        <Button variant="ghost" onClick={() => void onShare()}>
          <Icon name="link" />
          Share
        </Button>
      </div>
      <FormError>{error?.message}</FormError>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading profile
      </span>
      <div aria-hidden="true">
        <div className={styles.cover} />
        <div className={styles.head}>
          <span className={styles.avatar}>
            <Skeleton width={96} height={96} radius="50%" />
          </span>
          <div className={styles.grow}>
            <Skeleton width="40%" height={28} radius={8} />
            <Skeleton width="60%" />
          </div>
        </div>
        <div className={styles.grid}>
          <div>
            <div className={styles.stats}>
              {[0, 1, 2].map((index) => (
                <div key={index}>
                  <Skeleton width="50%" height={26} radius={8} />
                  <Skeleton width="80%" height={12} />
                </div>
              ))}
            </div>
            <div className={styles.panel}>
              <Skeleton width="30%" height={20} />
            </div>
          </div>
          <div className={styles.panel}>
            <Skeleton width="30%" height={20} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Keeps "Hosting now" current without polling: the lobby says when a public room's card changes, and the
 * follow watch says when this person enters or leaves one.
 */
function useLiveProfile(profile: UserProfile | undefined, username: string) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: profileKey(username) });

  useEffect(() => {
    if (!socket) return;
    return holdLobby(socket, queryClient);
  }, [socket, queryClient]);

  useSocketEvent('rooms:upsert', ({ room }) => {
    if (profile && room.host.id === profile.id) refresh();
  });
  useSocketEvent('rooms:remove', ({ roomId }) => {
    if (profile?.hostingNow?.id === roomId) refresh();
  });
  useSocketEvent('follows:live', ({ userId }) => {
    if (profile && userId === profile.id) refresh();
  });
}

/** Someone's profile (mockup `#profile`): who they are, what they're hosting, their stats and followers. */
export function ProfilePage() {
  const { username = '' } = useParams();
  const query = useProfile(username);
  const [openList, setOpenList] = useState<FollowListKind | null>(null);
  useLiveProfile(query.data?.profile, username);

  let content;
  if (query.isPending) content = <ProfileSkeleton />;
  else if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    content = notFound ? (
      <EmptyState
        title={`We couldn’t find @${username}`}
        action={<ButtonLink to="/home">Back to Home</ButtonLink>}
      >
        The username may be wrong, or the account was deleted.
      </EmptyState>
    ) : (
      <EmptyState
        title="Couldn’t load this profile"
        action={
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      >
        {query.error.message}
      </EmptyState>
    );
  } else {
    const { profile } = query.data;
    content = (
      <>
        <div className={styles.cover} />
        <div className={styles.head}>
          <span className={styles.avatar}>
            <Avatar initials={initialsOf(profile.name)} tone={avatarTone(profile.avatarColor)} size="lg" />
          </span>
          <div className={styles.grow}>
            <h1>{profile.name}</h1>
            <p>{profileSubtitle(profile)}</p>
          </div>
          <ProfileActions profile={profile} />
        </div>
        <div className={styles.grid}>
          <div>
            {profile.hostingNow ? <HostingNow room={profile.hostingNow} /> : null}
            {profile.stats ? <Stats stats={profile.stats} /> : null}
            <RecentRooms profile={profile} />
          </div>
          <div>
            <About profile={profile} />
            <Followers profile={profile} onOpen={setOpenList} />
          </div>
        </div>
        {openList ? (
          <FollowListModal profile={profile} kind={openList} onClose={() => setOpenList(null)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <BackLink />
      {content}
    </>
  );
}
