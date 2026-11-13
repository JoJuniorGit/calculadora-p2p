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
  decimals?: number;
}

function parseNumericValue(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

function formatAtmDisplay(value: string, decimals: number): string {
  const numericValue = parseNumericValue(value);
  if (!Number.isFinite(numericValue)) return value;

  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericValue);
}

function atmInputToValue(raw: string, decimals: number): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  return (Number(digits) / 10 ** decimals).toFixed(decimals);
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
  decimals = 2,
}: NumberFieldProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const numericValue = parseNumericValue(value);
  const displayValue = value.trim() === '' ? '' : formatAtmDisplay(value, decimals);
  const stepValue = step === 'any' ? undefined : step ?? 1;
  const decimalPlaces = Math.min(decimals, 10);
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
          inputMode="numeric"
          role="spinbutton"
          value={displayValue}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            const digits = raw.replace(/\D/g, '');
            const deleting = raw.length < displayValue.length;

            if (digits === '') {
              onChange('');
              return;
            }
            if (deleting && /^0+$/.test(digits)) {
              onChange('');
              return;
            }

            onChange(atmInputToValue(raw, decimals));
          }}
          onKeyDown={(event) => {
            if (stepValue === undefined || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
              return;
            }

            const increment = event.key === 'ArrowUp' ? stepValue : -stepValue;
            const current = Number.isFinite(numericValue) ? numericValue : 0;
            const nextValue = Number((current + increment).toFixed(decimalPlaces));
            event.preventDefault();
            onChange(nextValue.toFixed(decimalPlaces));
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
