import { useId } from 'react';
import styles from './fields.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  options: SelectOption[];
  error?: string;
  hint?: string;
  disabled?: boolean;
  name?: string;
  inline?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  disabled = false,
  name,
  inline = false,
}: SelectFieldProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={`${styles.field} ${inline ? styles.inlineField : ''}`}>
      <label className={inline ? styles.inlineLabel : styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        name={name}
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
