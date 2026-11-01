import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalShellProps {
  /** Escape and a click on the backdrop. */
  onClose: () => void;
  /** Renders the dialog as a <form>, so Enter in a field submits it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  labelledBy: string;
  describedBy?: string;
  /** Added to the dialog box, after the base `.modal` style. */
  className?: string;
  /** Where focus starts; defaults to the dialog itself. Called once the dialog is in the page. */
  initialFocus?: (dialog: HTMLElement) => HTMLElement | null | undefined;
  children: ReactNode;
}

/**
 * The parts every dialog shares (`.scrim` + `.modal` in the mockup): rendered over the page, Escape and a
 * click on the backdrop close it, Tab stays inside it, the page doesn't scroll behind it, and focus goes back
 * to whatever opened it.
 */
export function ModalShell({
  onClose,
  onSubmit,
  labelledBy,
  describedBy,
  className,
  initialFocus,
  children,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLFormElement & HTMLDivElement>(null);
  // Read on the first render, before the effect below moves focus into the dialog.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  // Only the first value counts: focus moves once, when the dialog opens.
  const initialFocusRef = useRef(initialFocus);

  useEffect(() => {
    // Done here rather than with autoFocus, which doesn't fire again when StrictMode remounts the effect.
    const dialog = dialogRef.current;
    if (dialog) (initialFocusRef.current?.(dialog) ?? dialog).focus();
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

  const dialogProps = {
    ref: dialogRef,
    className: className ? `${styles.modal} ${className}` : styles.modal,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
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
          {children}
        </form>
      ) : (
        <div {...dialogProps}>{children}</div>
      )}
    </div>,
    document.body,
  );
}
