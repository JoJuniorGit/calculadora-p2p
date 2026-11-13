import { describe, expect, it } from 'vitest';
import type { Rates } from '../../domain/types';
import {
  AUTO_RATE_REFRESH_TTL_MS,
  getRatesNeedingAutoRefresh,
} from './useAutoRateRefresh';

const now = Date.parse('2026-11-12T15:00:00.000Z');

function ratesWith(overrides: Partial<Rates> = {}): Rates {
  return {
    bcv: {
      value: 40,
      updatedAt: new Date(now - 60_000).toISOString(),
      source: 'auto',
    },
    binance: {
      value: 46,
      updatedAt: new Date(now - 60_000).toISOString(),
      source: 'auto',
    },
    ...overrides,
  };
}

describe('getRatesNeedingAutoRefresh', () => {
  it('requests both rates when they are not configured', () => {
    const rates = ratesWith({
      bcv: { value: 0, updatedAt: null, source: 'manual' },
      binance: { value: 0, updatedAt: null, source: 'manual' },
    });

    expect(getRatesNeedingAutoRefresh(rates, now)).toEqual(['bcv', 'binance']);
  });

  it('keeps fresh automatic rates without refreshing them', () => {
    expect(getRatesNeedingAutoRefresh(ratesWith(), now)).toEqual([]);
  });

  it('refreshes automatic rates once the ttl expires', () => {
    const staleTimestamp = new Date(
      now - AUTO_RATE_REFRESH_TTL_MS - 1,
    ).toISOString();
    const rates = ratesWith({
      binance: { value: 46, updatedAt: staleTimestamp, source: 'auto' },
    });

    expect(getRatesNeedingAutoRefresh(rates, now)).toEqual(['binance']);
  });

  it('respects manual rates even when they are old', () => {
    const oldTimestamp = new Date(now - AUTO_RATE_REFRESH_TTL_MS * 10).toISOString();
    const rates = ratesWith({
      bcv: { value: 40, updatedAt: oldTimestamp, source: 'manual' },
      binance: { value: 46, updatedAt: oldTimestamp, source: 'manual' },
    });

    expect(getRatesNeedingAutoRefresh(rates, now)).toEqual([]);
  });

  it('refreshes only the automatic rate when the other one is manual', () => {
    const staleTimestamp = new Date(
      now - AUTO_RATE_REFRESH_TTL_MS - 1,
    ).toISOString();
    const rates = ratesWith({
      bcv: { value: 40, updatedAt: staleTimestamp, source: 'manual' },
      binance: { value: 46, updatedAt: staleTimestamp, source: 'auto' },
    });

    expect(getRatesNeedingAutoRefresh(rates, now)).toEqual(['binance']);
  });

  it('refreshes an automatic rate with an invalid timestamp', () => {
    const rates = ratesWith({
      bcv: { value: 40, updatedAt: 'not-a-date', source: 'auto' },
    });

    expect(getRatesNeedingAutoRefresh(rates, now)).toEqual(['bcv']);
  });
});
