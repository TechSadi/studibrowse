import styles from './Avatar.module.css';

/** Avatar colour slots 1-6, matching --av1..--av6 (and AVATAR_COLORS order). */
export type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6;

interface AvatarProps {
  initials: string;
  tone?: AvatarTone;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ initials, tone = 1, size = 'md' }: AvatarProps) {
  const className = [styles.av, styles[`c${tone}`], size !== 'md' && styles[size]].filter(Boolean).join(' ');
  return <span className={className}>{initials}</span>;
}

interface AvatarStackProps {
  people: { initials: string; tone: AvatarTone }[];
  /** Extra count shown as a "+N" chip after the avatars. */
  more?: number;
}

export function AvatarStack({ people, more }: AvatarStackProps) {
  return (
    <div className={styles.stack}>
      {people.map((p) => (
        <Avatar key={p.initials} initials={p.initials} tone={p.tone} size="sm" />
      ))}
      {more ? <span className={`${styles.more} num`}>+{more}</span> : null}
    </div>
  );
}
