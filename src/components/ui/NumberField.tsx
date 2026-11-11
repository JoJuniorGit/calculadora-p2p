import { useId, type ReactNode } from 'react';
import styles from './fields.module.css';

export interface NumberFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  suffix?: string;
  action?: ReactNode;
  step?: number | 'any';
}

export function NumberField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  placeholder,
  name,
  suffix,
  action,
  step,
}: NumberFieldProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const normalizedValue = value.trim().replace(',', '.');
  const numericValue = normalizedValue === '' ? Number.NaN : Number(normalizedValue);
  const stepValue = step === 'any' ? undefined : step ?? 1;
  const adornmentClassName =
    suffix && action
      ? styles.inputWithSuffixAndAction
      : suffix
        ? styles.inputWithSuffix
        : action
          ? styles.inputWithAction
          : undefined;
  const wrapperClassName = [adornmentClassName, disabled ? styles.adornmentDisabled : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <div className={wrapperClassName || undefined}>
        <input
          id={fieldId}
          name={name}
          className={`${styles.input} ${styles.numberInput}`}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (stepValue === undefined || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
              return;
            }

            const increment = event.key === 'ArrowUp' ? stepValue : -stepValue;
            const current = Number.isFinite(numericValue) ? numericValue : 0;
            const decimalPlaces = String(stepValue).split('.')[1]?.length ?? 0;
            const nextValue = Number((current + increment).toFixed(Math.min(decimalPlaces, 10)));
            event.preventDefault();
            onChange(String(nextValue));
          }}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          aria-valuenow={Number.isFinite(numericValue) ? numericValue : undefined}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
        {action && <span className={styles.inputAction}>{action}</span>}
      </div>
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
