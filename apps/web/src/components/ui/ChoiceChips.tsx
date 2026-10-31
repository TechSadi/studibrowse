import styles from './ChoiceChips.module.css';

interface ChoiceChipsProps {
  options: readonly string[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  labelledBy: string;
}

/** Multi-select chips ("Subjects you usually study"). Each chip is a toggle button. */
export function ChoiceChips({ options, selected, onChange, labelledBy }: ChoiceChipsProps) {
  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);
  }
  return (
    <div className={styles.chips} role="group" aria-labelledby={labelledBy}>
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            className={on ? `${styles.chip} ${styles.on}` : styles.chip}
            onClick={() => toggle(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
