import { useId } from 'react';
import styles from './fields.module.css';

export interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  hint?: string;
  disabled?: boolean;
  name?: string;
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
  name,
}: ToggleFieldProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className={styles.toggleField}>
      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel} htmlFor={fieldId}>
          {label}
        </label>
        <input
          id={fieldId}
          name={name}
          className={styles.checkbox}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
        />
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
