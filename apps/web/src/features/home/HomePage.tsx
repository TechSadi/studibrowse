import { CreateRoomDialog } from '../rooms/CreateRoomDialog';
import { Hero } from './Hero';
import styles from './Home.module.css';
import { HomeHeader } from './HomeHeader';
import { LiveRooms } from './LiveRooms';
import { RecentSessions } from './RecentSessions';
import { useCreateRoomDialog } from './useCreateRoomDialog';
import { WeeklyFocus } from './WeeklyFocus';

export function HomePage() {
  const createRoom = useCreateRoomDialog();
  return (
    <>
      <HomeHeader />
      <div className={styles.overview}>
        <Hero />
        <WeeklyFocus />
      </div>
      <LiveRooms />
      <RecentSessions />
      {createRoom.isOpen ? <CreateRoomDialog onClose={createRoom.close} /> : null}
    </>
  );
}
