import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Field.module.css';

export type HintTone = 'muted' | 'ok' | 'error';

interface FrameProps {
  id: string;
  label: ReactNode;
  /** Shown instead of the hint, in the danger colour, and marks the input invalid. */
  error?: string | undefined;
  hint?: ReactNode;
  hintTone?: HintTone;
  /** Announce hint changes to screen readers (e.g. the username availability check). */
  liveHint?: boolean;
  /** Rendered at the right of the label row (e.g. "Forgot password?"). */
  labelAside?: ReactNode;
  /** Rendered between the input and the hint (e.g. the strength meter). */
  below?: ReactNode;
}

type FieldProps = FrameProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

function splitProps({
  id,
  label,
  error,
  hint,
  hintTone,
  liveHint,
  labelAside,
  below,
  className,
  ...input
}: FieldProps) {
  const frame: FrameProps = { id, label, error, hint, hintTone, liveHint, labelAside, below };
  const hasMessage = Boolean(error ?? hint);
  const inputProps = {
    id,
    className: [styles.field, error && styles.bad, className].filter(Boolean).join(' '),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': hasMessage ? `${id}-msg` : undefined,
    ...input,
  };
  return { frame, inputProps };
}

function messageClass(tone: HintTone) {
  if (tone === 'error') return styles.err;
  return tone === 'ok' ? `${styles.hint} ${styles.ok}` : styles.hint;
}

function FieldFrame({ frame, children }: { frame: FrameProps; children: ReactNode }) {
  const { id, label, error, hint, hintTone = 'muted', liveHint, labelAside, below } = frame;
  const message = error ?? hint;
  const labelEl = (
    <label className={styles.lbl} htmlFor={id}>
      {label}
    </label>
  );
  return (
    <div>
      {labelAside ? (
        <div className={styles.labelRow}>
          {labelEl}
          {labelAside}
        </div>
      ) : (
        labelEl
      )}
      {children}
      {below}
      {liveHint || message ? (
        <div
          id={`${id}-msg`}
          className={messageClass(error ? 'error' : hintTone)}
          aria-live={liveHint ? 'polite' : undefined}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

export function TextField(props: FieldProps) {
  const { frame, inputProps } = splitProps(props);
  return (
    <FieldFrame frame={frame}>
      <input {...inputProps} />
    </FieldFrame>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  const { frame, inputProps } = splitProps(props);
  return (
    <FieldFrame frame={frame}>
      <div className={styles.pwWrap}>
        <input {...inputProps} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className={styles.pwToggle}
          onClick={() => setVisible((v) => !v)}
          aria-controls={frame.id}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </FieldFrame>
  );
}

/** Form-level error line, for server errors that don't belong to one field. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={styles.err} role="alert">
      {children}
    </div>
  );
}
