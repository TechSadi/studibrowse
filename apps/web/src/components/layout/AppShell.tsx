import { useEffect } from 'react';
import { Outlet, useMatches } from 'react-router';
import styles from './AppShell.module.css';
import { PhoneHeader } from './PhoneHeader';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/** Set on each signed-in route: the page name in the breadcrumb and the tab title. */
export interface ShellRouteHandle {
  crumb: string;
}

function useCrumb(): string {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]!.handle as ShellRouteHandle | undefined;
    if (handle?.crumb) return handle.crumb;
  }
  return 'Home';
}

/** Layout for signed-in pages: sidebar (a bottom tab bar on phones), top bar and the page. */
export function AppShell() {
  const crumb = useCrumb();

  useEffect(() => {
    document.title = `${crumb} · StudiBrowse`;
  }, [crumb]);

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <Sidebar />
      <PhoneHeader />
      <main id="main" tabIndex={-1} className={styles.main}>
        <div className={styles.wrap}>
          <TopBar crumb={crumb} />
          <Outlet />
        </div>
      </main>
      <TabBar />
    </div>
  );
}
