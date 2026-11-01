import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Toast.module.css';

const TOAST_MS = 4200;

interface Toast {
  id: number;
  icon: IconName;
  title: string;
  detail?: string | undefined;
}

type ShowToast = (toast: Omit<Toast, 'id'>) => void;

const ToastContext = createContext<ShowToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((toast) => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { ...toast, id }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            <span className={styles.ico}>
              <Icon name={t.icon} />
            </span>
            <div>
              <b>{t.title}</b>
              {t.detail ? <small>{t.detail}</small> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
