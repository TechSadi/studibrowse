import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSearchParam } from '../../hooks/useSearchParam';
import { useSlashShortcut } from '../../hooks/useSlashShortcut';
import { Icon } from '../ui/Icon';
import iconButton from '../ui/IconButton.module.css';
import { ThemeToggle } from '../ui/ThemeToggle';
import styles from './TopBar.module.css';

/**
 * Searches the live rooms on Home. On Home it filters as you type (the `q` param, shared with the
 * Rooms worth joining search box); elsewhere, Enter goes to Home with the query.
 */
function TopSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashShortcut(inputRef);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useSearchParam('q');
  const [draft, setDraft] = useState('');
  const onHome = pathname === '/home';

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (onHome) {
      document.getElementById('live')?.scrollIntoView?.();
      return;
    }
    const q = draft.trim();
    setDraft('');
    navigate(q ? `/home?q=${encodeURIComponent(q)}` : '/home');
  }

  return (
    <form role="search" className={styles.search} onSubmit={onSubmit}>
      <Icon name="search" />
      <input
        ref={inputRef}
        type="search"
        value={onHome ? query : draft}
        onChange={(e) => (onHome ? setQuery(e.target.value) : setDraft(e.target.value))}
        placeholder="Search rooms, subjects, people"
        aria-label="Search rooms"
        aria-keyshortcuts="/"
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

/** Breadcrumb, search, theme toggle and notifications (desktop and tablet; hidden on phones). */
export function TopBar({ crumb }: { crumb: string }) {
  return (
    <div className={styles.topbar}>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        StudiBrowse<span aria-hidden="true">/</span>
        <b aria-current="page">{crumb}</b>
      </nav>
      <TopSearch />
      <ThemeToggle />
      <Link to="/notifications" className={iconButton.iconBtn} aria-label="Notifications">
        <Icon name="bell" />
      </Link>
    </div>
  );
}
