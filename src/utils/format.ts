/** Display-only formatting helpers. The engine never rounds for display. */

const amountFormatter = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const rateFormatter = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-VE', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('es-VE', {
  dateStyle: 'medium',
});

/** Numeric amount without a currency suffix, for headers that already state the currency. */
export function formatAmount(value: number): string {
  return amountFormatter.format(value);
}

export function formatBs(value: number): string {
  return `${formatAmount(value)} Bs.S`;
}

export function formatUsd(value: number): string {
  return `${formatAmount(value)} USD`;
}

export function formatPct(value: number, digits = 2): string {
  const formatter = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${formatter.format(value)}%`;
}

export function formatRate(value: number): string {
  return rateFormatter.format(value);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

/** Converts a numeric value into the string used by controlled number inputs. */
export function toInputNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}
