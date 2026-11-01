import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  /** Any CSS length. Defaults to the full width. */
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
}

/**
 * A placeholder block while something loads. Hidden from screen readers: put one "Loading …" status
 * (`sr-only`, `role="status"`) beside a group of them, as LiveRooms does.
 */
export function Skeleton({ width = '100%', height = 14, radius = 6, className }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return (
    <span
      className={className ? `${styles.skeleton} ${className}` : styles.skeleton}
      style={style}
      aria-hidden="true"
    />
  );
}
