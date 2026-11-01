import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  createRoomSchema,
  DEFAULT_ROOM_SIZE,
  DEFAULT_TIMER,
  GOAL_TEXT_MAX,
  MAX_GOALS,
  MAX_ROOM_SIZE,
  MIN_ROOM_SIZE,
  ROOM_NAME_MAX,
  ROOM_SUBJECT_MAX,
  TIMER_LIMITS,
  type CreateRoomInput,
  type TimerSettings,
} from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { FormError, TextField } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { Stepper, StepperGrid } from '../../components/ui/Stepper';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { roomsApi } from '../../lib/api';
import { onRadioKeyDown } from '../../lib/radioGroup';
import { useAuth } from '../auth/AuthContext';
import styles from './CreateRoomDialog.module.css';
import { formatMins, timerPlan } from './timerText';

/** The goal a new room starts with in the mockup. */
const STARTER_GOAL = 'Set your own goal before round 1';

const VISIBILITY = [
  { isPublic: true, title: 'Public', detail: 'Listed in Live now' },
  { isPublic: false, title: 'Private', detail: 'Invite link only' },
] as const;

type TimerField = keyof typeof TIMER_LIMITS;

const STEPPERS: { field: TimerField; label: string; unit?: string }[] = [
  { field: 'focusMins', label: 'Focus', unit: ' min' },
  { field: 'shortBreakMins', label: 'Short break', unit: ' min' },
  { field: 'longBreakMins', label: 'Long break', unit: ' min' },
  { field: 'roundsBeforeLong', label: 'Long break every' },
  { field: 'totalRounds', label: 'Total rounds' },
];

export const NAME_REQUIRED = 'Give your room a name so people know what they’re joining.';

interface Draft {
  name: string;
  subject: string;
  maxSize: number;
  isPublic: boolean;
  timerSettings: TimerSettings;
  goals: string[];
}

function TimerSummary({ settings }: { settings: TimerSettings }) {
  const plan = timerPlan(settings, new Date());
  return (
    <div className={styles.summary}>
      <b>{plan.rounds}</b> rounds · <b>{formatMins(plan.focusMins)}</b> focus ·{' '}
      <b>{formatMins(plan.totalMins)}</b> total · ends around <b>{plan.endsAround}</b> if started now
    </div>
  );
}

function GoalsField({ goals, onChange }: { goals: string[]; onChange: (goals: string[]) => void }) {
  const [text, setText] = useState('');
  const full = goals.length >= MAX_GOALS;

  function add() {
    const goal = text.trim();
    if (!goal || full) return;
    onChange([...goals, goal]);
    setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the goal instead of submitting the dialog.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  }

  return (
    <div>
      <label className={styles.lbl} htmlFor="room-goal">
        Room goals <small>(up to {MAX_GOALS}, members can add more)</small>
      </label>
      <div className={styles.inlineForm}>
        <input
          id="room-goal"
          className={styles.field}
          value={text}
          maxLength={GOAL_TEXT_MAX}
          placeholder={
            full
              ? `That’s ${MAX_GOALS} goals, the most a room can have`
              : 'e.g. Finish chapter 4 for everyone'
          }
          disabled={full}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button
          variant="ghost"
          size="sm"
          className={styles.addBtn}
          onClick={add}
          disabled={full || !text.trim()}
        >
          Add
        </Button>
      </div>
      {goals.length ? (
        <ul className={styles.goalChips} aria-label="Room goals">
          {goals.map((goal, index) => (
            <li key={`${index}-${goal}`}>
              {goal}
              <button
                type="button"
                aria-label={`Remove goal: ${goal}`}
                onClick={() => onChange(goals.filter((_, i) => i !== index))}
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Create a room (mockup `#roomForm`). On success it opens the new room with you as host. */
export function CreateRoomDialog({ onClose }: { onClose: () => void }) {
  const { state } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const visibilityLabel = useId();

  const [draft, setDraft] = useState<Draft>(() => ({
    name: '',
    subject: '',
    maxSize: DEFAULT_ROOM_SIZE,
    isPublic: true,
    timerSettings: { ...(state.user?.timerDefaults ?? DEFAULT_TIMER), autoStart: true },
    goals: [STARTER_GOAL],
  }));
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const update = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const setTimer = (field: keyof TimerSettings, value: number | boolean) =>
    setDraft((d) => ({ ...d, timerSettings: { ...d.timerSettings, [field]: value } }));

  const create = useMutation({
    mutationFn: (input: CreateRoomInput) => roomsApi.create(input),
    onSuccess: ({ room }) => {
      void queryClient.invalidateQueries({ queryKey: ['rooms', 'public'] });
      queryClient.setQueryData(['rooms', room.id], { room });
      navigate(`/room/${room.id}`);
      toast({ icon: 'link', title: 'Room created', detail: 'Copy the invite link to bring people in.' });
    },
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const result = createRoomSchema.safeParse(draft);
    if (!result.success) {
      const issue = result.error.issues[0];
      if (issue?.path[0] === 'name') {
        setNameError(draft.name.trim() ? (issue.message ?? NAME_REQUIRED) : NAME_REQUIRED);
        document.getElementById('room-name')?.focus();
      } else {
        setFormError(issue?.message ?? 'Check the room settings and try again.');
      }
      return;
    }
    create.mutate(result.data);
  }

  const footer = (
    <>
      <span className={styles.summary}>Rooms close 5 minutes after the last person leaves.</span>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create and open'}
        </Button>
      </div>
    </>
  );

  return (
    <Modal
      title="Create a study room"
      subtitle="You'll be the host. Anyone with the link can join once they've signed in."
      onClose={onClose}
      onSubmit={onSubmit}
      footer={footer}
    >
      <TextField
        id="room-name"
        label="Room name"
        value={draft.name}
        maxLength={ROOM_NAME_MAX}
        placeholder="e.g. Late-night exam grind"
        autoComplete="off"
        error={nameError ?? undefined}
        onChange={(e) => {
          update({ name: e.target.value });
          setNameError(null);
        }}
      />
      <div className={styles.grid2}>
        <TextField
          id="room-subject"
          label={
            <>
              Subject <small>(optional)</small>
            </>
          }
          value={draft.subject}
          maxLength={ROOM_SUBJECT_MAX}
          placeholder="Anything, or leave blank"
          autoComplete="off"
          onChange={(e) => update({ subject: e.target.value })}
        />
        <div>
          <label className={styles.lbl} htmlFor="room-size">
            Room size
          </label>
          <div className={styles.rangeRow}>
            <input
              id="room-size"
              type="range"
              min={MIN_ROOM_SIZE}
              max={MAX_ROOM_SIZE}
              value={draft.maxSize}
              aria-valuetext={`${draft.maxSize} people`}
              onChange={(e) => update({ maxSize: Number(e.target.value) })}
            />
            <output htmlFor="room-size" className="num">
              {draft.maxSize} people
            </output>
          </div>
        </div>
      </div>
      <div>
        <span className={styles.lbl} id={visibilityLabel}>
          Who can find it
        </span>
        <div className={styles.toggleRow} role="radiogroup" aria-labelledby={visibilityLabel}>
          {VISIBILITY.map((option, index) => {
            const on = option.isPublic === draft.isPublic;
            const select = (i: number) => update({ isPublic: VISIBILITY[i]!.isPublic });
            return (
              <button
                key={option.title}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={on ? `${styles.opt} ${styles.on}` : styles.opt}
                onClick={() => select(index)}
                onKeyDown={(e) => onRadioKeyDown(e, index, VISIBILITY.length, select)}
              >
                <b>{option.title}</b>
                <small>{option.detail}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.timerSet}>
        <span className={styles.lbl}>Shared timer</span>
        <StepperGrid>
          {STEPPERS.map(({ field, label, unit }) => (
            <Stepper
              key={field}
              label={label}
              unit={unit}
              value={draft.timerSettings[field]}
              onChange={(value) => setTimer(field, value)}
              {...TIMER_LIMITS[field]}
            />
          ))}
        </StepperGrid>
        <div className={styles.checkRow}>
          <span aria-hidden="true">Start the next round automatically</span>
          <Switch
            label="Auto-start next round"
            checked={draft.timerSettings.autoStart}
            onChange={(autoStart) => setTimer('autoStart', autoStart)}
          />
        </div>
        <TimerSummary settings={draft.timerSettings} />
      </div>
      <GoalsField goals={draft.goals} onChange={(goals) => update({ goals })} />
      <FormError>{formError}</FormError>
    </Modal>
  );
}
