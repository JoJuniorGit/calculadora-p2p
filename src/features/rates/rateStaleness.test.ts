import { describe, expect, it } from 'vitest';
import type { RateQuote } from '../../domain/types';
import {
  formatRateAge,
  getRateAgeMs,
  isRateStale,
  STALE_RATE_THRESHOLD_MS,
} from './rateStaleness';

const now = Date.parse('2026-11-12T15:00:00.000Z');

function quote(overrides: Partial<RateQuote> = {}): RateQuote {
  return {
    value: 46,
    updatedAt: new Date(now - 60_000).toISOString(),
    source: 'auto',
    ...overrides,
  };
}

describe('isRateStale', () => {
  it('flags automatic rates that reached the 10 minute threshold', () => {
    expect(
      isRateStale(
        quote({ updatedAt: new Date(now - STALE_RATE_THRESHOLD_MS).toISOString() }),
        now,
      ),
    ).toBe(true);
  });

  it('keeps fresh automatic rates', () => {
    expect(
      isRateStale(
        quote({ updatedAt: new Date(now - STALE_RATE_THRESHOLD_MS + 1).toISOString() }),
        now,
      ),
    ).toBe(false);
  });

  it('never flags manual rates, even when they are old', () => {
    expect(
      isRateStale(
        quote({
          updatedAt: new Date(now - STALE_RATE_THRESHOLD_MS * 10).toISOString(),
          source: 'manual',
        }),
        now,
      ),
    ).toBe(false);
  });

  it('ignores unconfigured rates', () => {
    expect(isRateStale(quote({ value: 0 }), now)).toBe(false);
  });

  it('flags automatic rates without a valid timestamp', () => {
    expect(isRateStale(quote({ updatedAt: null }), now)).toBe(true);
    expect(isRateStale(quote({ updatedAt: 'not-a-date' }), now)).toBe(true);
  });
});

describe('rate age helpers', () => {
  it('measures the age of a usable timestamp', () => {
    expect(getRateAgeMs(quote({ updatedAt: new Date(now - 90_000).toISOString() }), now)).toBe(
      90_000,
    );
    expect(getRateAgeMs(quote({ updatedAt: null }), now)).toBeNull();
    expect(getRateAgeMs(quote({ updatedAt: 'not-a-date' }), now)).toBeNull();
  });

  it('formats minutes and hours for the warning message', () => {
    expect(formatRateAge(30_000)).toBe('1 min');
    expect(formatRateAge(23 * 60_000)).toBe('23 min');
    expect(formatRateAge(125 * 60_000)).toBe('2 h 5 min');
    expect(formatRateAge(2 * 60 * 60_000)).toBe('2 h');
  });
});
