import styles from './FilterChip.module.css';

export interface FilterChipProps {
  label: string;
  active: boolean;
  onToggle(): void;
  title?: string;
}

export function FilterChip({ label, active, onToggle, title }: FilterChipProps) {
  const className = [styles.chip, active ? styles.active : undefined].filter(Boolean).join(' ');

  return (
    <button
      className={className}
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onToggle}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
