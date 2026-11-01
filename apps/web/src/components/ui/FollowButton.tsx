import styles from './FollowButton.module.css';

interface FollowButtonProps {
  following: boolean;
  onToggle: () => void;
  /** The person's name, so screen readers hear "Follow Maya Kapoor". */
  name: string;
  disabled?: boolean;
}

/** Follow / Following toggle (onboarding, profiles, the Room closed page). */
export function FollowButton({ following, onToggle, name, disabled }: FollowButtonProps) {
  return (
    <button
      type="button"
      className={following ? `${styles.follow} ${styles.on}` : styles.follow}
      aria-pressed={following}
      aria-label={`Follow ${name}`}
      disabled={disabled}
      onClick={onToggle}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
