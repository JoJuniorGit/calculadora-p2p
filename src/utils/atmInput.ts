/** ATM-style numeric input helpers: digits fill from the right with fixed decimals. */

const formatterCache = new Map<number, Intl.NumberFormat>();

function getFormatter(decimals: number): Intl.NumberFormat {
  const cached = formatterCache.get(decimals);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  formatterCache.set(decimals, formatter);
  return formatter;
}

function parseNumericValue(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

/** Formats a plain numeric string with es-VE grouping and fixed decimals. */
export function formatAtmDisplay(value: string, decimals = 2): string {
  const numericValue = parseNumericValue(value);
  if (!Number.isFinite(numericValue)) return value;

  return getFormatter(decimals).format(numericValue);
}

/** Converts raw keystrokes into a plain decimal string with implied decimals. */
export function atmInputToValue(raw: string, decimals = 2): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  return (Number(digits) / 10 ** decimals).toFixed(decimals);
}

/** Applies an ATM edit, clearing the field when deleting leaves only zeros. */
export function nextAtmValue(
  previousDisplay: string,
  raw: string,
  decimals = 2,
): string {
  const digits = raw.replace(/\D/g, '');
  const deleting = raw.length < previousDisplay.length;

  if (digits === '') return '';
  if (deleting && /^0+$/.test(digits)) return '';

  return atmInputToValue(raw, decimals);
}
