import type { NotificationPrefs } from '@studibrowse/shared';
import { SettingsSection, SwitchRow } from './SettingsLayout';
import { useMe, useSaveMe } from './useSaveMe';

const ROWS: { key: keyof NotificationPrefs; title: string; hint: string; label: string }[] = [
  {
    key: 'roomOpened',
    title: 'Someone you follow opens a room',
    hint: 'The main way to find sessions',
    label: 'Follow opens room',
  },
  {
    key: 'roomFull',
    title: 'Your room fills up',
    hint: 'When a room you host reaches its limit',
    label: 'Room full',
  },
  {
    key: 'memberJoined',
    title: 'Someone joins your room',
    hint: 'Only while you’re the host',
    label: 'Someone joins',
  },
  {
    key: 'roundEnded',
    title: 'Round ends',
    // The mockup says "A sound and a notification when focus or break ends", but this setting only covers the
    // notification, which is sent when a focus round ends. The sound has its own mute in the room.
    hint: 'A notification when a focus round ends',
    label: 'Round ends',
  },
];

export function NotificationsSection({ id }: { id: string }) {
  const user = useMe();
  const save = useSaveMe();
  return (
    <SettingsSection
      id={id}
      title="Notifications"
      description="Choose what we tell you about. In-app and browser notifications."
    >
      {ROWS.map(({ key, title, hint, label }) => (
        <SwitchRow
          key={key}
          title={title}
          hint={hint}
          label={label}
          checked={user.notificationPrefs[key]}
          onSave={(checked) =>
            save(
              { notificationPrefs: { [key]: checked } },
              { icon: 'bell', title: 'Notifications saved', detail: `${title}: ${checked ? 'on' : 'off'}` },
            )
          }
        />
      ))}
    </SettingsSection>
  );
}
