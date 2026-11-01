import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/ui/Icon';
import iconButton from '../../components/ui/IconButton.module.css';
import styles from './SidePanel.module.css';

export const PANEL_TABS = ['chat', 'goals', 'people', 'files'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export const TAB_LABELS: Record<PanelTab, string> = {
  chat: 'Chat',
  goals: 'Goals',
  people: 'People',
  files: 'Files',
};

export const TAB_ICONS: Record<PanelTab, IconName> = {
  chat: 'chat',
  goals: 'target',
  people: 'users',
  files: 'file',
};

interface SidePanelProps {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  /** Counts shown on the tabs: "2/4" on Goals, "8" on People. */
  counts: Partial<Record<PanelTab, string>>;
  /** Below 1100px the panel is a drawer that slides in from the right. */
  drawer: boolean;
  open: boolean;
  onClose: () => void;
  /** Every pane stays mounted, so the chat keeps its draft and scroll position between tabs. */
  panes: Record<PanelTab, ReactNode>;
}

/** The focus room's one side panel: Chat, Goals, People and Files (mockup `.side`). */
export function SidePanel({ tab, onTabChange, counts, drawer, open, onClose, panes }: SidePanelProps) {
  const tabRefs = useRef(new Map<PanelTab, HTMLButtonElement>());

  // The latest tab and close handler, for the effect below, which runs only when the drawer opens or closes.
  const latest = useRef({ tab, onClose });
  useEffect(() => {
    latest.current = { tab, onClose };
  });

  // Opening the drawer moves focus into it; closing it gives focus back to whatever opened it.
  useEffect(() => {
    if (!drawer || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tabRefs.current.get(latest.current.tab)?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') latest.current.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [drawer, open]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = PANEL_TABS.length - 1;
    let next: number;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    const nextTab = PANEL_TABS[next]!;
    onTabChange(nextTab);
    tabRefs.current.get(nextTab)?.focus();
  }

  const className = [styles.side, drawer && styles.drawer, drawer && open && styles.open]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={className} aria-label="Room panel" aria-hidden={drawer && !open ? true : undefined}>
      <div className={styles.tabs} role="tablist" aria-label="Room panel">
        {PANEL_TABS.map((name, index) => {
          const selected = name === tab;
          return (
            <button
              key={name}
              ref={(el) => {
                if (el) tabRefs.current.set(name, el);
                else tabRefs.current.delete(name);
              }}
              type="button"
              role="tab"
              id={`room-tab-${name}`}
              aria-selected={selected}
              aria-controls={`room-pane-${name}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? styles.on : undefined}
              onClick={() => onTabChange(name)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {name === 'chat' ? <Icon name="chat" className={styles.tabIcon} /> : null}
              {TAB_LABELS[name]}
              {counts[name] ? <span className={`${styles.cnt} num`}>{counts[name]}</span> : null}
            </button>
          );
        })}
        {drawer ? (
          <button
            type="button"
            className={`${iconButton.iconBtn} ${styles.close}`}
            aria-label="Close panel"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        ) : null}
      </div>
      {PANEL_TABS.map((name) => (
        <div
          key={name}
          id={`room-pane-${name}`}
          role="tabpanel"
          aria-labelledby={`room-tab-${name}`}
          className={styles.pane}
          hidden={name !== tab}
        >
          {panes[name]}
        </div>
      ))}
    </aside>
  );
}

interface PanelDockProps {
  onOpen: (tab: PanelTab) => void;
  /** New chat messages since you last looked at the chat. */
  unreadChat: number;
}

/** Below 1100px: the small bar that opens the side panel on a tab (mockup `.dock`). */
export function PanelDock({ onOpen, unreadChat }: PanelDockProps) {
  return (
    <nav className={styles.dock} aria-label="Room panels">
      {PANEL_TABS.map((name) => (
        <button key={name} type="button" onClick={() => onOpen(name)}>
          <Icon name={TAB_ICONS[name]} />
          {TAB_LABELS[name]}
          {name === 'chat' && unreadChat > 0 ? (
            <span className={`${styles.cnt} num`}>
              {unreadChat}
              <span className="sr-only"> new</span>
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
