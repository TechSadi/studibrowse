import styles from './Avatar.module.css';

/** Avatar colour slots 1-6, matching --av1..--av6 (and AVATAR_COLORS order). */
export type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6;

interface AvatarProps {
  initials: string;
  tone?: AvatarTone;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Hidden from screen readers: an avatar always sits beside the person's name (or inside a stack that has its own
 * label), so reading the initials too would just repeat it.
 */
export function Avatar({ initials, tone = 1, size = 'md' }: AvatarProps) {
  const className = [styles.av, styles[`c${tone}`], size !== 'md' && styles[size]].filter(Boolean).join(' ');
  return (
    <span className={className} aria-hidden="true">
      {initials}
    </span>
  );
}

interface AvatarStackProps {
  people: { initials: string; tone: AvatarTone }[];
  /** Extra count shown as a "+N" chip after the avatars. */
  more?: number | undefined;
  /** What the stack means, for screen readers ("Studying now: Maya, Jordan"). Without it the stack is decoration. */
  label?: string | undefined;
}

export function AvatarStack({ people, more, label }: AvatarStackProps) {
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  return (
    <div className={styles.stack} {...a11y}>
      {/* Two people can share initials, so the position is part of the key. */}
      {people.map((p, i) => (
        <Avatar key={`${i}-${p.initials}`} initials={p.initials} tone={p.tone} size="sm" />
      ))}
      {more ? <span className={`${styles.more} num`}>+{more}</span> : null}
    </div>
  );
}
