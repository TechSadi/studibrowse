import { useState } from 'react';
import type { TimerPhase } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { emitWithAck } from '../../lib/socket';
import styles from './TimerControls.module.css';
import type { TimerView } from './timerView';

type Command = 'timer:start' | 'timer:pause' | 'timer:skip' | 'timer:reset';

interface TimerControlsProps {
  roomId: string;
  phase: TimerPhase;
  view: TimerView;
}

/** Start/Pause, Skip and Reset (mockup `#hostControls`). Only rendered for the host; the server checks too. */
export function TimerControls({ roomId, phase, view }: TimerControlsProps) {
  const toast = useToast();
  const [pending, setPending] = useState<Command | null>(null);

  async function send(command: Command) {
    setPending(command);
    try {
      await emitWithAck(command, { roomId });
    } catch (err) {
      toast({
        icon: 'x',
        title: 'The timer didn’t change',
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPending(null);
    }
  }

  const started = phase !== 'idle' && phase !== 'done';
  const primaryLabel = phase === 'done' ? 'Start again' : view.running ? 'Pause' : 'Start';

  return (
    <div className={styles.controls}>
      <Button
        disabled={pending !== null}
        onClick={() => void send(view.running ? 'timer:pause' : 'timer:start')}
      >
        <Icon name={view.running ? 'pause' : 'play'} />
        {primaryLabel}
      </Button>
      <Button variant="ghost" disabled={pending !== null || !started} onClick={() => void send('timer:skip')}>
        <Icon name="skip" />
        Skip
      </Button>
      <Button
        variant="ghost"
        disabled={pending !== null || phase === 'idle'}
        onClick={() => void send('timer:reset')}
      >
        <Icon name="reset" />
        Reset
      </Button>
    </div>
  );
}

/** What everyone else sees instead of the controls (mockup `#memberNote`). */
export function HostOnlyNote({ hostName }: { hostName: string | null }) {
  return (
    <div className={styles.memberNote}>
      <Icon name="crown" className={styles.crown} />
      <span>
        {hostName
          ? `${hostName} is the host and controls the timer.`
          : 'Only the host can control the timer.'}
      </span>
    </div>
  );
}
