import { useId } from 'react';
import styles from './InfoTooltip.module.css';

export interface InfoTooltipProps {
  label: string;
  content: string;
  align?: 'start' | 'center' | 'end';
}

export function InfoTooltip({ label, content, align = 'end' }: InfoTooltipProps) {
  const tooltipId = useId();
  const tooltipClassName = [
    styles.tooltip,
    align === 'start' ? styles.tooltipStart : '',
    align === 'center' ? styles.tooltipCenter : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={styles.root}>
      <button
        className={styles.trigger}
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      <span className={tooltipClassName} id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}
