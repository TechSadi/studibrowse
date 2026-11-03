import { Icon, type IconName } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useTheme } from '../../hooks/useTheme';
import { onRadioKeyDown } from '../../lib/radioGroup';
import type { ThemePref } from '../../lib/theme';
import styles from './Settings.module.css';
import { SettingRow, SettingsSection } from './SettingsLayout';

const OPTIONS: { pref: ThemePref; label: string; icon?: IconName }[] = [
  { pref: 'system', label: 'System' },
  { pref: 'light', label: 'Light', icon: 'sun' },
  { pref: 'dark', label: 'Dark', icon: 'moon' },
];

export function AppearanceSection({ id }: { id: string }) {
  const { pref, choose } = useTheme();
  const toast = useToast();
  const selected = OPTIONS.findIndex((o) => o.pref === pref);

  // useTheme saves the choice as sb-theme and sets data-theme on <html>.
  const select = (index: number) => {
    const option = OPTIONS[index]!;
    if (option.pref === pref) return;
    choose(option.pref);
    toast({
      icon: option.icon ?? 'check',
      title: 'Appearance saved',
      detail: option.pref === 'system' ? 'Following your device setting' : `${option.label} on this device`,
    });
  };

  return (
    <SettingsSection id={id} title="Appearance" description="Choose how StudiBrowse looks on this device.">
      <SettingRow title="Theme" hint="System follows your device setting">
        <div className={styles.segTheme} role="radiogroup" aria-label="Theme">
          {OPTIONS.map(({ pref: value, label, icon }, index) => {
            const checked = index === selected;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={checked ? styles.on : undefined}
                onClick={() => select(index)}
                onKeyDown={(e) => onRadioKeyDown(e, index, OPTIONS.length, select)}
              >
                {icon ? <Icon name={icon} /> : null}
                {label}
              </button>
            );
          })}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
