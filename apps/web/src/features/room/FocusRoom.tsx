import { useEffect, useRef, useState } from 'react';
import type { PublicUser } from '@studibrowse/shared';
import { PhoneHeader } from '../../components/layout/PhoneHeader';
import { useToast } from '../../components/ui/Toast';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSocketEvent } from '../../hooks/useSocket';
import { CreateRoomDialog } from '../rooms/CreateRoomDialog';
import { ChatPanel } from './chat/ChatPanel';
import { FilesPanel } from './FilesPanel';
import styles from './FocusRoom.module.css';
import { GoalsPanel } from './GoalsPanel';
import { MyStatus } from './MyStatus';
import { firstName } from './people';
import { PeopleList, PeoplePanel } from './PeopleList';
import { ReconnectBanner } from './ReconnectBanner';
import { RoomBar } from './RoomBar';
import type { JoinedRoom } from './roomSession';
import { PanelDock, SidePanel, type PanelTab } from './SidePanel';
import { HostOnlyNote, TimerControls } from './TimerControls';
import { TimerRing } from './TimerRing';
import { TimerSettingsSummary } from './TimerSettingsSummary';
import { timerTitle, timerView } from './timerView';
import { useRoomTimer } from './useRoomTimer';
import { useTimerSounds } from './useTimerSounds';

/** Where the side panel stops being a column and becomes a drawer (the mockup's breakpoint). */
const DRAWER_QUERY = '(max-width: 1100px)';

export function inviteUrl(code: string): string {
  return `${window.location.origin}/r/${code}`;
}

interface FocusRoomProps {
  joined: JoinedRoom;
  rejoining: boolean;
  user: PublicUser;
  /** The code this room was joined with, for private rooms where only the host sees `room.inviteCode`. */
  inviteCode: string | undefined;
  onLeave: () => void;
}

/** The focus room once you're in (mockup `#room`): the timer on the stage and one side panel. */
export function FocusRoom({ joined, rejoining, user, inviteCode, onLeave }: FocusRoomProps) {
  const { room, members, resources, messages, snapshot } = joined;
  const toast = useToast();
  const me = members.find((member) => member.userId === user.id);
  // Presence knows about a host hand-over before the room detail does.
  const isHost = me?.isHost ?? room.isHost;
  const host = members.find((member) => member.isHost);
  const hostName = host && host.userId !== user.id ? firstName(host.name) : null;

  const { timer, remainingMs } = useRoomTimer(room.id, snapshot);
  const view = timerView(timer, room.timerSettings, remainingMs);
  const { soundOn, toggleSound } = useTimerSounds(timer.phase);

  const title = timerTitle(view, room.name);
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(
    () => () => {
      document.title = 'StudiBrowse';
    },
    [],
  );

  // ---- Side panel ----
  const drawer = useMediaQuery(DRAWER_QUERY);
  const [tab, setTab] = useState<PanelTab>('chat');
  const [panelOpen, setPanelOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const chatVisible = tab === 'chat' && (!drawer || panelOpen);

  function showTab(next: PanelTab) {
    setTab(next);
    if (next === 'chat') setUnreadChat(0);
  }

  useSocketEvent('chat:new', ({ message }) => {
    if (message.roomId === room.id && message.userId !== user.id && !chatVisible) setUnreadChat((n) => n + 1);
  });

  // ---- Coming back after a dropped connection ----
  const wasRejoining = useRef(rejoining);
  useEffect(() => {
    if (wasRejoining.current && !rejoining) {
      toast({ icon: 'check', title: 'Back in the room', detail: 'You’re connected again.' });
    }
    wasRejoining.current = rejoining;
  }, [rejoining, toast]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const code = room.inviteCode ?? inviteCode;
  const goalsDone = room.goals.filter((goal) => goal.done).length;

  return (
    <>
      <PhoneHeader variant="room" />
      <main className={styles.view}>
        <div className={styles.stage}>
          <div className={styles.inner}>
            <ReconnectBanner rejoining={rejoining} />
            <RoomBar
              room={room}
              isHost={isHost}
              hostName={hostName}
              inviteUrl={code ? inviteUrl(code) : null}
              soundOn={soundOn}
              onToggleSound={toggleSound}
              onOpenSettings={() => setSettingsOpen(true)}
              onLeave={onLeave}
            />

            <section className={styles.timerZone} aria-label="Shared timer">
              <TimerRing view={view} remainingMs={remainingMs} />
              {isHost ? (
                <TimerControls roomId={room.id} phase={timer.phase} view={view} />
              ) : (
                <HostOnlyNote hostName={hostName} />
              )}
              <TimerSettingsSummary settings={room.timerSettings} />
            </section>

            {me ? <MyStatus roomId={room.id} me={me} /> : null}
            <PeopleList members={members} myUserId={user.id} />
          </div>
        </div>

        <SidePanel
          tab={tab}
          onTabChange={showTab}
          counts={{
            goals: room.goals.length ? `${goalsDone}/${room.goals.length}` : undefined,
            people: String(members.length),
          }}
          drawer={drawer}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          panes={{
            chat: (
              <ChatPanel
                roomId={room.id}
                initialMessages={messages}
                myUserId={user.id}
                members={members}
                focusRound={timer.phase === 'focus'}
              />
            ),
            goals: <GoalsPanel goals={room.goals} members={members} myUserId={user.id} />,
            people: <PeoplePanel members={members} myUserId={user.id} />,
            files: <FilesPanel resources={resources} members={members} />,
          }}
        />
        {drawer ? (
          <PanelDock
            unreadChat={chatVisible ? 0 : unreadChat}
            onOpen={(next) => {
              showTab(next);
              setPanelOpen(true);
            }}
          />
        ) : null}
      </main>

      {settingsOpen && isHost ? (
        <CreateRoomDialog
          mode="settings"
          room={room}
          memberCount={members.length}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
