import { useId } from 'react';
import styles from './fields.module.css';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  type?: 'text' | 'date';
  min?: string;
  max?: string;
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  placeholder,
  name,
  type = 'text',
  min,
  max,
}: TextFieldProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        className={styles.input}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
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
