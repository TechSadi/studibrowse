import { Hero } from './Hero';
import styles from './Home.module.css';
import { HomeHeader } from './HomeHeader';
import { LiveRooms } from './LiveRooms';
import { RecentSessions } from './RecentSessions';
import { WeeklyFocus } from './WeeklyFocus';

export function HomePage() {
  return (
    <>
      <HomeHeader />
      <div className={styles.overview}>
        <Hero />
        <WeeklyFocus />
      </div>
      <LiveRooms />
      <RecentSessions />
    </>
  );
}
