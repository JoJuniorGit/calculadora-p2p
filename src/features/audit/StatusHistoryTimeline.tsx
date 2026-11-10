import type { StatusChange } from '../../domain/types';
import { PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import { formatDateTime } from '../../utils/format';
import styles from './StatusHistoryTimeline.module.css';

export interface StatusHistoryTimelineProps {
  entries: StatusChange[];
}

function timestampValue(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function StatusHistoryTimeline({ entries }: StatusHistoryTimelineProps) {
  const chronologicalEntries = [...entries].sort(
    (left, right) => timestampValue(left.timestamp) - timestampValue(right.timestamp),
  );

  return (
    <ol className={styles.timeline} aria-label="Historial de estados">
      {chronologicalEntries.map((entry) => (
        <li key={entry.id} className={styles.entry}>
          <time className={styles.timestamp} dateTime={entry.timestamp}>
            {formatDateTime(entry.timestamp)}
          </time>
          <p className={styles.transition}>
            {entry.fromStatus === null
              ? `Registro creado → ${PURCHASE_STATUS_LABELS[entry.toStatus]}`
              : `${PURCHASE_STATUS_LABELS[entry.fromStatus]} → ${PURCHASE_STATUS_LABELS[entry.toStatus]}`}
          </p>
          {entry.note.trim() && <p className={styles.note}>{entry.note}</p>}
        </li>
      ))}
    </ol>
  );
}
