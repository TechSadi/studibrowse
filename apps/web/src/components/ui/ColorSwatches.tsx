import { AVATAR_COLORS, type AvatarColor } from '@studibrowse/shared';
import { avatarTone } from '../../lib/avatar';
import { onRadioKeyDown } from '../../lib/radioGroup';
import avatarStyles from './Avatar.module.css';
import styles from './ColorSwatches.module.css';

const LABELS: Record<AvatarColor, string> = {
  green: 'Green',
  gold: 'Gold',
  blue: 'Blue',
  purple: 'Purple',
  red: 'Red',
  olive: 'Olive',
};

interface ColorSwatchesProps {
  value: AvatarColor;
  onChange: (color: AvatarColor) => void;
  labelledBy: string;
}

/** The avatar colour picker in onboarding and Settings. */
export function ColorSwatches({ value, onChange, labelledBy }: ColorSwatchesProps) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-labelledby={labelledBy}>
      {AVATAR_COLORS.map((color, index) => {
        const checked = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={LABELS[color]}
            tabIndex={checked ? 0 : -1}
            className={[styles.swatch, avatarStyles[`c${avatarTone(color)}`], checked && styles.on]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(color)}
            onKeyDown={(e) =>
              onRadioKeyDown(e, index, AVATAR_COLORS.length, (i) => onChange(AVATAR_COLORS[i]!))
            }
          />
        );
      })}
    </div>
  );
}
