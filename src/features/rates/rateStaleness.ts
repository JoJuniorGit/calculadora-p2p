import type { RateQuote } from '../../domain/types';

/** A P2P rate older than this is considered stale for the calculator warning. */
export const STALE_RATE_THRESHOLD_MS = 10 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

/**
 * Only automatic rates can be flagged as stale: manual rates are an explicit
 * user choice and the auto-refresh intentionally never overwrites them.
 */
export function isRateStale(
  quote: RateQuote,
  now = Date.now(),
  thresholdMs = STALE_RATE_THRESHOLD_MS,
): boolean {
  if (!Number.isFinite(quote.value) || quote.value <= 0) return false;
  if (quote.source !== 'auto') return false;
  if (quote.updatedAt === null) return true;

  const updatedAt = Date.parse(quote.updatedAt);
  return !Number.isFinite(updatedAt) || now - updatedAt >= thresholdMs;
}

/** Age in milliseconds, or null when the quote has no usable timestamp. */
export function getRateAgeMs(quote: RateQuote, now = Date.now()): number | null {
  if (quote.updatedAt === null) return null;
  const updatedAt = Date.parse(quote.updatedAt);
  if (!Number.isFinite(updatedAt)) return null;
  return Math.max(0, now - updatedAt);
}

export function formatRateAge(ageMs: number): string {
  const minutes = Math.max(1, Math.floor(ageMs / MINUTE_MS));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}
