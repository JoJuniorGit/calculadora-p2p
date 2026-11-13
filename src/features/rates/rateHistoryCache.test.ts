import { describe, expect, it, vi } from 'vitest';
import type { AsyncKeyValueStorage } from '../../storage/indexedDb';
import type { HistoricalRateSample } from './ratesApi';
import {
  BCV_HISTORY_EXTRA_DAYS,
  RATE_HISTORY_CACHE_KEY,
  RATE_HISTORY_RETENTION_DAYS,
  getBcvHistoryRetentionCutoff,
  getRateHistory,
  getRateHistoryRetentionCutoff,
  loadRateHistoryCache,
  mergeRateHistorySamples,
  pruneRateHistoryCache,
  pruneStoredRateHistoryCache,
  saveRateHistoryCache,
  type RateHistoryCache,
} from './rateHistoryCache';

const NOW = new Date(2026, 10, 12, 12, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function createStorage(): AsyncKeyValueStorage {
  const values = new Map<string, string>();

  return {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

function binanceSample(daysAgo: number, rate = 1_000 + daysAgo): HistoricalRateSample {
  return {
    capturedAt: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    source: 'binance',
    buyRate: rate,
    sellRate: null,
    priceMethod: 'median',
  };
}

function bcvSample(daysAgo: number, rate = 900 + daysAgo): HistoricalRateSample {
  return {
    capturedAt: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    source: 'bcv',
    buyRate: rate,
    sellRate: null,
  };
}

function createCache(partial: Partial<RateHistoryCache> = {}): RateHistoryCache {
  return {
    version: 1,
    lastFetchedAt: null,
    lastBcvFetchedAt: null,
    seededAt: null,
    binance: [],
    bcv: [],
    ...partial,
  };
}

describe('rate history cache', () => {
  it('seeds 90 days of Binance and 93 days of BCV once', async () => {
    const storage = createStorage();
    const fetchBinance = vi.fn(async (_since: number) => [
      binanceSample(89, 1_100),
      binanceSample(0, 1_200),
    ]);
    const fetchBcv = vi.fn(async () => [
      bcvSample(92, 900),
      bcvSample(89, 910),
      bcvSample(0, 920),
    ]);

    const samples = await getRateHistory({
      now: NOW,
      storage,
      fetchBinance,
      fetchBcv,
    });

    expect(fetchBinance).toHaveBeenCalledTimes(1);
    expect(fetchBcv).toHaveBeenCalledTimes(1);
    expect(fetchBinance.mock.calls[0][0]).toBe(
      getRateHistoryRetentionCutoff(NOW) - 2 * DAY_MS,
    );

    expect(samples).toHaveLength(5);
    const cache = await loadRateHistoryCache(storage);
    expect(cache?.binance).toHaveLength(2);
    expect(cache?.bcv).toHaveLength(3);
    expect(cache?.seededAt).toBe(new Date(NOW).toISOString());
  });

  it('does not hit the API again while the cache is fresh', async () => {
    const storage = createStorage();
    const firstBinance = vi.fn(async () => [binanceSample(0)]);
    const firstBcv = vi.fn(async () => [bcvSample(0)]);

    const first = await getRateHistory({
      now: NOW,
      storage,
      fetchBinance: firstBinance,
      fetchBcv: firstBcv,
    });

    const secondBinance = vi.fn(async () => [binanceSample(0)]);
    const secondBcv = vi.fn(async () => [bcvSample(0)]);
    const second = await getRateHistory({
      now: NOW + 10 * 60 * 1_000,
      storage,
      fetchBinance: secondBinance,
      fetchBcv: secondBcv,
    });

    expect(secondBinance).not.toHaveBeenCalled();
    expect(secondBcv).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it('fetches only the incremental Binance window after the TTL', async () => {
    const storage = createStorage();
    const seedBinance = vi.fn(async () => [binanceSample(0, 1_200)]);
    const seedBcv = vi.fn(async () => [bcvSample(0, 920)]);

    await getRateHistory({
      now: NOW,
      storage,
      fetchBinance: seedBinance,
      fetchBcv: seedBcv,
    });

    const nextNow = NOW + DAY_MS;
    const nextBinanceSample: HistoricalRateSample = {
      capturedAt: new Date(nextNow).toISOString(),
      source: 'binance',
      buyRate: 1_300,
      sellRate: null,
      priceMethod: 'median',
    };
    const nextBcvSample: HistoricalRateSample = {
      capturedAt: new Date(nextNow).toISOString(),
      source: 'bcv',
      buyRate: 930,
      sellRate: null,
    };
    const fetchBinance = vi.fn(async (_since: number) => [nextBinanceSample]);
    const fetchBcv = vi.fn(async () => [nextBcvSample]);

    const samples = await getRateHistory({
      now: nextNow,
      storage,
      fetchBinance,
      fetchBcv,
    });

    expect(fetchBinance).toHaveBeenCalledTimes(1);
    expect(fetchBinance.mock.calls[0][0]).toBe(NOW - 2 * DAY_MS);
    expect(samples.some((sample) => sample.buyRate === 1_300)).toBe(true);
    expect(samples.some((sample) => sample.buyRate === 930)).toBe(true);
  });

  it('prunes Binance at 90 days and keeps BCV 3 extra days', () => {
    const cache = createCache({
      binance: [
        binanceSample(89, 1_089),
        binanceSample(90, 1_090),
        binanceSample(92, 1_092),
      ],
      bcv: [
        bcvSample(92, 992),
        bcvSample(93, 993),
        bcvSample(94, 994),
      ],
    });

    const pruned = pruneRateHistoryCache(cache, NOW);

    expect(pruned.binance.map((sample) => sample.buyRate)).toEqual([1_089]);
    expect(pruned.bcv.map((sample) => sample.buyRate)).toEqual([992]);
    expect(RATE_HISTORY_RETENTION_DAYS).toBe(90);
    expect(BCV_HISTORY_EXTRA_DAYS).toBe(3);
    expect(getBcvHistoryRetentionCutoff(NOW)).toBe(
      getRateHistoryRetentionCutoff(NOW) - 3 * DAY_MS,
    );
  });

  it('prunes and persists stored samples on startup', async () => {
    const storage = createStorage();
    await saveRateHistoryCache(
      createCache({
        binance: [binanceSample(89, 1_089), binanceSample(90, 1_090)],
        bcv: [bcvSample(92, 992), bcvSample(93, 993)],
      }),
      storage,
    );

    await pruneStoredRateHistoryCache(NOW, storage);

    const cache = await loadRateHistoryCache(storage);
    expect(cache?.binance.map((sample) => sample.buyRate)).toEqual([1_089]);
    expect(cache?.bcv.map((sample) => sample.buyRate)).toEqual([992]);
  });

  it('deduplicates Binance by timestamp and BCV by day', () => {
    const merged = mergeRateHistorySamples(
      [
        binanceSample(1, 1_000),
        {
          capturedAt: '2026-11-11T00:00:00.000Z',
          source: 'bcv',
          buyRate: 900,
          sellRate: null,
        },
      ],
      [
        binanceSample(1, 1_100),
        {
          capturedAt: '2026-11-11T12:00:00.000Z',
          source: 'bcv',
          buyRate: 910,
          sellRate: null,
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((sample) => sample.source === 'binance')?.buyRate).toBe(1_100);
    expect(merged.find((sample) => sample.source === 'bcv')?.buyRate).toBe(910);
  });

  it('discards a corrupt cache and seeds again', async () => {
    const storage = createStorage();
    await storage.setItem(RATE_HISTORY_CACHE_KEY, '{invalid json');
    const fetchBinance = vi.fn(async () => [binanceSample(0)]);
    const fetchBcv = vi.fn(async () => [bcvSample(0)]);

    const samples = await getRateHistory({
      now: NOW,
      storage,
      fetchBinance,
      fetchBcv,
    });

    expect(fetchBinance).toHaveBeenCalledTimes(1);
    expect(fetchBcv).toHaveBeenCalledTimes(1);
    expect(samples).toHaveLength(2);
  });

  it('keeps cached data when one incremental source fails', async () => {
    const storage = createStorage();
    await getRateHistory({
      now: NOW,
      storage,
      fetchBinance: vi.fn(async () => [binanceSample(0, 1_200)]),
      fetchBcv: vi.fn(async () => [bcvSample(0, 920)]),
    });

    const nextNow = NOW + 2 * DAY_MS;
    const nextBcvSample: HistoricalRateSample = {
      capturedAt: new Date(nextNow).toISOString(),
      source: 'bcv',
      buyRate: 930,
      sellRate: null,
    };
    const samples = await getRateHistory({
      now: nextNow,
      storage,
      fetchBinance: vi.fn(async () => {
        throw new Error('offline');
      }),
      fetchBcv: vi.fn(async () => [nextBcvSample]),
    });

    expect(samples.some((sample) => sample.source === 'binance')).toBe(true);
    expect(samples.some((sample) => sample.buyRate === 930)).toBe(true);
  });

  it('throws when there is no cache and both sources fail', async () => {
    const storage = createStorage();

    await expect(
      getRateHistory({
        now: NOW,
        storage,
        fetchBinance: vi.fn(async () => {
          throw new Error('offline');
        }),
        fetchBcv: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
    ).rejects.toThrow('offline');
  });

  it('forces a refresh even when the cache is fresh', async () => {
    const storage = createStorage();
    await getRateHistory({
      now: NOW,
      storage,
      fetchBinance: vi.fn(async () => [binanceSample(0)]),
      fetchBcv: vi.fn(async () => [bcvSample(0)]),
    });

    const fetchBinance = vi.fn(async () => [binanceSample(0, 1_500)]);
    const fetchBcv = vi.fn(async () => [bcvSample(0, 950)]);

    await getRateHistory({
      now: NOW,
      storage,
      forceRefresh: true,
      fetchBinance,
      fetchBcv,
    });

    expect(fetchBinance).toHaveBeenCalledTimes(1);
    expect(fetchBcv).toHaveBeenCalledTimes(1);
  });
});
