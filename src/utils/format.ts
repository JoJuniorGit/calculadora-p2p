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
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
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

export function formatUsdt(value: number): string {
  return `${formatAmount(value)} USDT`;
}

export function formatPct(value: number, digits = 2): string {
  const formatter = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${formatter.format(value)}%`;
}

/** Formats a percentage and only appends a fixed USDT charge when it is non-zero. */
export function formatPctWithFixedUsdt(
  pct: number,
  fixedUsdt: number,
  pctDigits = 2,
): string {
  const pctLabel = formatPct(pct, pctDigits);
  if (!Number.isFinite(fixedUsdt) || Number(fixedUsdt.toFixed(2)) <= 0) {
    return pctLabel;
  }

  return pct <= 0 ? formatUsdt(fixedUsdt) : `${pctLabel} + ${formatUsdt(fixedUsdt)}`;
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

/** Returns the local calendar date key for an ISO timestamp. */
export function toLocalDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats a YYYY-MM-DD value as a local calendar date without parsing it as UTC. */
export function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '—';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '—';
  }

  return dateFormatter.format(date);
}

/** Converts a numeric value into the string used by controlled number inputs. */
export function toInputNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}
