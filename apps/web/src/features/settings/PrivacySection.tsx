import type { PrivacyPrefs } from '@studibrowse/shared';
import { SettingsSection, SwitchRow } from './SettingsLayout';
import { useMe, useSaveMe } from './useSaveMe';

const ROWS: { key: keyof PrivacyPrefs; title: string; hint: string; label: string }[] = [
  {
    key: 'showStudying',
    // The mockup reads "Show what I'm working on / Your status line in rooms", but this setting hides the
    // "what are you studying" line on your profile and in people lists; room notes are always shown.
    title: 'Show what I’m studying',
    hint: 'The line under your name on your profile',
    label: 'Show what I’m studying',
  },
  {
    key: 'showStats',
    title: 'Show my stats on my profile',
    hint: 'Hours, streak and rooms hosted',
    label: 'Show stats',
  },
];

export function PrivacySection({ id }: { id: string }) {
  const user = useMe();
  const save = useSaveMe();
  return (
    <SettingsSection id={id} title="Privacy" description="Control what other people can see.">
      {ROWS.map(({ key, title, hint, label }) => (
        <SwitchRow
          key={key}
          title={title}
          hint={hint}
          label={label}
          checked={user.privacy[key]}
          onSave={(checked) =>
            save(
              { privacy: { [key]: checked } },
              { title: 'Privacy saved', detail: `${title}: ${checked ? 'on' : 'off'}` },
            )
          }
        />
      ))}
    </SettingsSection>
  );
}
