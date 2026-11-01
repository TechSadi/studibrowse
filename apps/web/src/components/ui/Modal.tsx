import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import iconButton from './IconButton.module.css';
import styles from './Modal.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Renders the dialog as a <form>, so Enter in a field submits it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A modal dialog (`.scrim` + `.modal` in the mockup). Escape, the close button and a click on the backdrop
 * close it; Tab stays inside it; focus goes back to whatever opened it.
 */
export function Modal({ title, subtitle, onClose, onSubmit, footer, children }: ModalProps) {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<HTMLFormElement & HTMLDivElement>(null);
  // Read on the first render, before the effect below moves focus into the dialog.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    // Start on the first field, or on the dialog itself. Done here rather than with autoFocus, which
    // doesn't fire again when StrictMode remounts the effect.
    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector<HTMLElement>(
      `.${styles.body} :is(input, select, textarea):not([disabled])`,
    );
    (firstField ?? dialog)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      // Leave focus alone if closing moved it somewhere on purpose (e.g. navigating to the new room).
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const content = (
    <>
      <div className={styles.head}>
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
        </div>
        <button type="button" className={iconButton.iconBtn} onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.foot}>{footer}</div> : null}
    </>
  );

  const dialogProps = {
    ref: dialogRef,
    className: styles.modal,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    'aria-describedby': subtitle ? subtitleId : undefined,
    tabIndex: -1,
    onKeyDown,
  } as const;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {onSubmit ? (
        <form {...dialogProps} onSubmit={onSubmit} noValidate>
          {content}
        </form>
      ) : (
        <div {...dialogProps}>{content}</div>
      )}
    </div>,
    document.body,
  );
}
