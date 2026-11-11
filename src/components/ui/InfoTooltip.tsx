import { useId } from 'react';
import styles from './InfoTooltip.module.css';

export interface InfoTooltipProps {
  label: string;
  content: string;
}

export function InfoTooltip({ label, content }: InfoTooltipProps) {
  const tooltipId = useId();

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
      <span className={styles.tooltip} id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}
