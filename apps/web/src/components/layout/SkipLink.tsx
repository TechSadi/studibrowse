import styles from './SkipLink.module.css';

/** The first Tab stop on a page: jumps past the header and navigation to `#main`. */
export function SkipLink() {
  return (
    <a className={styles.skip} href="#main">
      Skip to content
    </a>
  );
}
