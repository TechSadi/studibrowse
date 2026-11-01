import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useAuth } from './AuthContext';

/** Logs out on this device. The RequireAuth guard then sends the visitor to Welcome. */
export function LogoutButton() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void logout();
      }}
    >
      {pending ? 'Logging out…' : 'Log out'}
    </Button>
  );
}
