import { useNavigate } from 'react-router';
import { useSearchParam } from '../../hooks/useSearchParam';

export const CREATE_ROOM_PATH = '/home?create=1';

/**
 * Whether the Create a room dialog is open, kept in the URL (`/home?create=1`) so the phone tab bar
 * can open it from any page. HomePage renders the dialog while the flag is set.
 */
export function useCreateRoomDialog() {
  const [flag, setFlag] = useSearchParam('create');
  const navigate = useNavigate();
  return {
    isOpen: flag === '1',
    open: () => navigate(CREATE_ROOM_PATH),
    close: () => setFlag(''),
  };
}
