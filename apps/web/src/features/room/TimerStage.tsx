import { memo, useEffect } from 'react';
import type { TimerSettings } from '@studibrowse/shared';
import styles from './FocusRoom.module.css';
import { HostOnlyNote, TimerControls } from './TimerControls';
import { TimerRing } from './TimerRing';
import { TimerSettingsSummary } from './TimerSettingsSummary';
import { timerTitle, timerView } from './timerView';
import { useTimeLeft, type RoomClock } from './useRoomTimer';

interface TimerStageProps {
  roomId: string;
  roomName: string;
  clock: RoomClock;
  settings: TimerSettings;
  /** The settings the current phase was timed with (see usePhaseSettings). */
  phaseSettings: TimerSettings;
  isHost: boolean;
  hostName: string | null;
}

/**
 * The timer zone of the focus room. It's the only part that re-renders every second (with the tab title),
 * so the chat, people and goals beside it stay still while the clock runs.
 */
export const TimerStage = memo(function TimerStage({
  roomId,
  roomName,
  clock,
  settings,
  phaseSettings,
  isHost,
  hostName,
}: TimerStageProps) {
  const remainingMs = useTimeLeft(clock);
  const view = timerView(clock.timer, settings, remainingMs, phaseSettings);

  const title = timerTitle(view, roomName);
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(
    () => () => {
      document.title = 'StudiBrowse';
    },
    [],
  );

  return (
    <section className={styles.timerZone} aria-label="Shared timer">
      <TimerRing view={view} remainingMs={remainingMs} />
      {isHost ? (
        <TimerControls roomId={roomId} phase={clock.timer.phase} view={view} />
      ) : (
        <HostOnlyNote hostName={hostName} />
      )}
      <TimerSettingsSummary settings={settings} />
    </section>
  );
});
