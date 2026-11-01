import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { INVITE_CODE_PATTERN } from '@studibrowse/shared';
import { SoloCard, SoloScreen } from '../../components/layout/SoloScreen';
import { ButtonLink } from '../../components/ui/Button';
import { ApiError, roomsApi } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { RoomStateScreen } from '../room/RoomStateScreen';
import styles from './Invite.module.css';
import { InviteCard } from './InviteCard';
import { authPathFor, refetchDelay, roomPathFor } from './invitePreview';
import { RoomClosedCard } from './RoomClosedCard';

export const inviteQueryKey = (code: string) => ['rooms', 'invite', code] as const;

/**
 * `/r/:inviteCode`, signed in or out. Signed in, an open room opens straight away. Signed out, it previews the
 * room; Sign up and Log in come back here (`?next=`), which then opens it. A closed room shows Room closed.
 */
export function InvitePage() {
  const { inviteCode: code = '' } = useParams();
  const validCode = INVITE_CODE_PATTERN.test(code);
  const { state: auth } = useAuth();
  const preview = useQuery({
    queryKey: inviteQueryKey(code),
    queryFn: () => roomsApi.invite(code),
    enabled: validCode,
    // A 4xx (unknown code, rate limited) won't change by asking again straight away.
    retry: (failures, err) => !(err instanceof ApiError && err.status < 500) && failures < 3,
    refetchInterval: (query) => refetchDelay(query.state.data, Date.now()),
  });

  // The not-found and error screens set their own title.
  const title = preview.data?.status === 'closed' ? 'This room has closed' : preview.data?.room.name;
  useEffect(() => {
    if (title) document.title = `${title} · StudiBrowse`;
  }, [title]);

  const logIn =
    auth.status === 'signedOut' ? (
      <ButtonLink variant="ghost" size="sm" to={authPathFor('login', code)}>
        Log in
      </ButtonLink>
    ) : null;

  if (!validCode || (preview.error instanceof ApiError && preview.error.code === 'ROOM_NOT_FOUND')) {
    return <RoomStateScreen kind="notFound" homeTo="/" actions={logIn} onRetry={() => undefined} />;
  }
  if (preview.isError) {
    return (
      <RoomStateScreen
        kind="error"
        message={preview.error.message}
        homeTo="/"
        actions={logIn}
        onRetry={() => void preview.refetch()}
      />
    );
  }
  if (auth.status === 'loading' || preview.isPending) return <InviteSkeleton />;

  const { data } = preview;
  if (data.status === 'closed') {
    return (
      <SoloScreen homeTo="/" actions={logIn}>
        <RoomClosedCard room={data.room} code={code} />
      </SoloScreen>
    );
  }
  if (auth.user) return <Navigate to={roomPathFor(data.room.id, code)} replace />;
  return (
    <SoloScreen homeTo="/" actions={logIn}>
      <InviteCard room={data.room} code={code} />
    </SoloScreen>
  );
}

function InviteSkeleton() {
  return (
    <SoloScreen homeTo="/">
      <SoloCard>
        <div role="status" aria-label="Loading the invite">
          <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
          <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
          <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
          <span className={`${styles.skeleton} ${styles.skeletonStats}`} />
          <span className={`${styles.skeleton} ${styles.skeletonButton}`} />
        </div>
      </SoloCard>
    </SoloScreen>
  );
}
