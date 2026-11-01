import { useId, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import iconButton from './IconButton.module.css';
import styles from './Modal.module.css';
import { ModalShell } from './ModalShell';

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
 * A modal dialog with a title, a close button, a body and an optional footer. Escape, the close button and a
 * click on the backdrop close it (see ModalShell). Focus starts on the first field.
 */
export function Modal({ title, subtitle, onClose, onSubmit, footer, children }: ModalProps) {
  const titleId = useId();
  const subtitleId = useId();

  return (
    <ModalShell
      onClose={onClose}
      {...(onSubmit ? { onSubmit } : {})}
      labelledBy={titleId}
      {...(subtitle ? { describedBy: subtitleId } : {})}
      initialFocus={(dialog) =>
        dialog.querySelector<HTMLElement>(`.${styles.body} :is(input, select, textarea):not([disabled])`)
      }
    >
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
    </ModalShell>
  );
}
