import { useEffect, useRef, useState } from 'react';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  value: string;
  label: string;
  disabled?: boolean;
}

type CopyFeedback = 'idle' | 'success' | 'error';

async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy copy command when clipboard permissions reject the request.
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  try {
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function CopyButton({ value, label, disabled = false }: CopyButtonProps) {
  const [feedback, setFeedback] = useState<CopyFeedback>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = async (): Promise<void> => {
    if (disabled) return;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);

    const copied = await copyText(value);
    setFeedback(copied ? 'success' : 'error');
    timeoutRef.current = setTimeout(() => {
      setFeedback('idle');
      timeoutRef.current = null;
    }, 1500);
  };

  const feedbackLabel =
    feedback === 'success'
      ? '¡Copiado!'
      : feedback === 'error'
        ? 'No se pudo copiar'
        : undefined;
  const accessibleLabel =
    feedback === 'success'
      ? `¡Copiado!: ${label}`
      : feedback === 'error'
        ? `No se pudo copiar ${label}`
        : `Copiar ${label}`;
  const buttonClassName = [
    styles.copyButton,
    feedback === 'success' ? styles.success : undefined,
    feedback === 'error' ? styles.error : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={buttonClassName}
      type="button"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      disabled={disabled}
      onClick={handleCopy}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="7" y="3" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 15v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {feedbackLabel && (
        <span className={styles.feedback} aria-live="polite">
          {feedbackLabel}
        </span>
      )}
    </button>
  );
}
