import type { TableColumnKey, TableColumnWidths } from './types';

export interface TableColumnLimits {
  /** Default width in CSS pixels. */
  default: number;
  min: number;
  max: number;
  /** Human-readable label used by the resize handle. */
  label: string;
}

export const TABLE_COLUMN_LIMITS: Record<TableColumnKey, TableColumnLimits> = {
  bank: { default: 230, min: 170, max: 480, label: 'Banco' },
  investment: { default: 155, min: 140, max: 320, label: 'Inversión' },
  outcome: { default: 165, min: 145, max: 320, label: 'Resultado' },
  profit: { default: 165, min: 145, max: 320, label: 'Ganancia' },
  status: { default: 145, min: 130, max: 320, label: 'Estado' },
  actions: { default: 64, min: 64, max: 64, label: 'Acciones' },
};

/** Column render order; `actions` is fixed and has no resize handle. */
export const TABLE_COLUMNS: TableColumnKey[] = [
  'bank',
  'investment',
  'outcome',
  'profit',
  'status',
  'actions',
];

export function clampTableColumnWidth(column: TableColumnKey, width: number): number {
  const { min, max } = TABLE_COLUMN_LIMITS[column];
  if (!Number.isFinite(width)) return TABLE_COLUMN_LIMITS[column].default;
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** Stored widths with defaults and clamps applied, ready for rendering. */
export function resolveTableColumnWidths(
  widths: TableColumnWidths,
): Record<TableColumnKey, number> {
  const resolved = {} as Record<TableColumnKey, number>;

  for (const column of TABLE_COLUMNS) {
    const stored = widths[column];
    resolved[column] =
      typeof stored === 'number' && Number.isFinite(stored)
        ? clampTableColumnWidth(column, stored)
        : TABLE_COLUMN_LIMITS[column].default;
  }

  return resolved;
}

export interface RenderedTableWidths {
  /** Widths to render, already stretched to fill the container when possible. */
  widths: Record<TableColumnKey, number>;
  /** Total table width; greater than the container when scrolling is needed. */
  totalWidth: number;
  /** True when the spare room was shared between the resizable columns. */
  fillable: boolean;
}

/**
 * Fills the available width with the leftover room split evenly between the
 * resizable columns (Acciones keeps its fixed width). When the configured
 * widths already exceed the container, the table keeps its width and the
 * wrapper enables horizontal scrolling instead of squeezing columns.
 */
export function distributeTableWidths(
  baseWidths: Record<TableColumnKey, number>,
  availableWidth: number,
): RenderedTableWidths {
  const baseSum = TABLE_COLUMNS.reduce(
    (total, column) => total + baseWidths[column],
    0,
  );
  const resizableColumns = TABLE_COLUMNS.filter((column) => column !== 'actions');
  const fillable =
    Number.isFinite(availableWidth) && availableWidth > baseSum;

  if (!fillable) {
    return { widths: { ...baseWidths }, totalWidth: baseSum, fillable: false };
  }

  const share = (availableWidth - baseSum) / resizableColumns.length;
  const widths = { ...baseWidths };

  for (const column of resizableColumns) {
    widths[column] = baseWidths[column] + share;
  }

  return { widths, totalWidth: availableWidth, fillable: true };
}
