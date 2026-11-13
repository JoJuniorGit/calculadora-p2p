import {
  createAsyncKeyValueStorage,
  RATE_HISTORY_CACHE_KEY,
  type AsyncKeyValueStorage,
} from '../../storage/indexedDb';
import {
  fetchBcvRateHistory,
  fetchBinanceRateHistorySince,
  type HistoricalRateSample,
} from './ratesApi';

export { RATE_HISTORY_CACHE_KEY };
export const RATE_HISTORY_CACHE_VERSION = 1;
export const RATE_HISTORY_RETENTION_DAYS = 90;
export const BCV_HISTORY_EXTRA_DAYS = 3;
export const RATE_HISTORY_FETCH_OVERLAP_DAYS = 2;
export const RATE_HISTORY_CACHE_TTL_MS = 30 * 60 * 1000;
export const BCV_HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

const defaultRateHistoryStorage = createAsyncKeyValueStorage({
  mirrorToLocalStorage: false,
});

export interface RateHistoryCache {
  version: number;
  lastFetchedAt: string | null;
  lastBcvFetchedAt: string | null;
  seededAt: string | null;
  binance: HistoricalRateSample[];
  bcv: HistoricalRateSample[];
}

export interface GetRateHistoryOptions {
  now?: number;
  forceRefresh?: boolean;
  storage?: AsyncKeyValueStorage;
  fetchBinance?: (since: number) => Promise<HistoricalRateSample[]>;
  fetchBcv?: () => Promise<HistoricalRateSample[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHistoricalSample(value: unknown): value is HistoricalRateSample {
  if (!isRecord(value)) return false;
  if (value.source !== 'binance' && value.source !== 'bcv') return false;
  if (
    typeof value.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    return false;
  }
  if (
    typeof value.buyRate !== 'number' ||
    !Number.isFinite(value.buyRate) ||
    value.buyRate <= 0
  ) {
    return false;
  }
  if (
    value.sellRate !== null &&
    (typeof value.sellRate !== 'number' || !Number.isFinite(value.sellRate))
  ) {
    return false;
  }
  if (
    value.priceMethod !== undefined &&
    value.priceMethod !== 'median' &&
    value.priceMethod !== 'average'
  ) {
    return false;
  }
  return true;
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getRateHistoryRetentionCutoff(now = Date.now()): number {
  return startOfLocalDay(now) - (RATE_HISTORY_RETENTION_DAYS - 1) * DAY_MS;
}

export function getBcvHistoryRetentionCutoff(now = Date.now()): number {
  return getRateHistoryRetentionCutoff(now) - BCV_HISTORY_EXTRA_DAYS * DAY_MS;
}

function createEmptyCache(): RateHistoryCache {
  return {
    version: RATE_HISTORY_CACHE_VERSION,
    lastFetchedAt: null,
    lastBcvFetchedAt: null,
    seededAt: null,
    binance: [],
    bcv: [],
  };
}

export function mergeRateHistorySamples(
  current: readonly HistoricalRateSample[],
  incoming: readonly HistoricalRateSample[],
): HistoricalRateSample[] {
  const byKey = new Map<string, HistoricalRateSample>();

  for (const sample of [...current, ...incoming]) {
    const timestamp = Date.parse(sample.capturedAt);
    if (!Number.isFinite(timestamp)) continue;

    const key =
      sample.source === 'bcv'
        ? `bcv:${sample.capturedAt.slice(0, 10)}`
        : `binance:${sample.capturedAt}`;
    const previous = byKey.get(key);

    if (!previous || timestamp >= Date.parse(previous.capturedAt)) {
      byKey.set(key, sample);
    }
  }

  return [...byKey.values()].sort(
    (left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt),
  );
}

export function pruneRateHistoryCache(
  cache: RateHistoryCache,
  now = Date.now(),
): RateHistoryCache {
  const binanceCutoff = getRateHistoryRetentionCutoff(now);
  const bcvCutoff = getBcvHistoryRetentionCutoff(now);

  return {
    ...cache,
    binance: mergeRateHistorySamples([], cache.binance).filter(
      (sample) => Date.parse(sample.capturedAt) >= binanceCutoff,
    ),
    bcv: mergeRateHistorySamples([], cache.bcv).filter(
      (sample) => Date.parse(sample.capturedAt) >= bcvCutoff,
    ),
  };
}

export async function loadRateHistoryCache(
  storage: AsyncKeyValueStorage = defaultRateHistoryStorage,
): Promise<RateHistoryCache | null> {
  try {
    const raw = await storage.getItem(RATE_HISTORY_CACHE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== RATE_HISTORY_CACHE_VERSION) {
      return null;
    }
    if (!Array.isArray(parsed.binance) || !Array.isArray(parsed.bcv)) {
      return null;
    }
    if (
      !parsed.binance.every(
        (sample) => isHistoricalSample(sample) && sample.source === 'binance',
      ) ||
      !parsed.bcv.every(
        (sample) => isHistoricalSample(sample) && sample.source === 'bcv',
      )
    ) {
      return null;
    }

    return {
      version: RATE_HISTORY_CACHE_VERSION,
      lastFetchedAt:
        typeof parsed.lastFetchedAt === 'string' ? parsed.lastFetchedAt : null,
      lastBcvFetchedAt:
        typeof parsed.lastBcvFetchedAt === 'string'
          ? parsed.lastBcvFetchedAt
          : null,
      seededAt: typeof parsed.seededAt === 'string' ? parsed.seededAt : null,
      binance: parsed.binance,
      bcv: parsed.bcv,
    };
  } catch {
    return null;
  }
}

export async function saveRateHistoryCache(
  cache: RateHistoryCache,
  storage: AsyncKeyValueStorage = defaultRateHistoryStorage,
): Promise<void> {
  try {
    await storage.setItem(RATE_HISTORY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A full or unavailable storage must not break the chart.
  }
}

export async function clearRateHistoryCache(
  storage: AsyncKeyValueStorage = defaultRateHistoryStorage,
): Promise<void> {
  try {
    await storage.removeItem(RATE_HISTORY_CACHE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export async function pruneStoredRateHistoryCache(
  now = Date.now(),
  storage: AsyncKeyValueStorage = defaultRateHistoryStorage,
): Promise<void> {
  const cache = await loadRateHistoryCache(storage);
  if (!cache) return;

  await saveRateHistoryCache(pruneRateHistoryCache(cache, now), storage);
}

function isFresh(iso: string | null, now: number, ttlMs: number): boolean {
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) && now - timestamp < ttlMs;
}

function latestTimestamp(samples: readonly HistoricalRateSample[]): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    const timestamp = Date.parse(sample.capturedAt);
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return latest;
}

let inFlightRequest: Promise<HistoricalRateSample[]> | null = null;

export function getRateHistory(
  options: GetRateHistoryOptions = {},
): Promise<HistoricalRateSample[]> {
  const usesDefaultRequest =
    options.forceRefresh !== true &&
    options.storage === undefined &&
    options.now === undefined &&
    options.fetchBinance === undefined &&
    options.fetchBcv === undefined;

  if (!usesDefaultRequest) return getRateHistoryInternal(options);
  if (inFlightRequest) return inFlightRequest;

  const request = getRateHistoryInternal(options);
  inFlightRequest = request;
  request.then(
    () => {
      if (inFlightRequest === request) inFlightRequest = null;
    },
    () => {
      if (inFlightRequest === request) inFlightRequest = null;
    },
  );
  return request;
}

async function getRateHistoryInternal(
  options: GetRateHistoryOptions = {},
): Promise<HistoricalRateSample[]> {
  const now = options.now ?? Date.now();
  const storage = options.storage;
  const fetchBinance = options.fetchBinance ?? fetchBinanceRateHistorySince;
  const fetchBcv = options.fetchBcv ?? fetchBcvRateHistory;

  const stored = await loadRateHistoryCache(storage);
  const base = stored ? pruneRateHistoryCache(stored, now) : createEmptyCache();

  const needsSeed = !stored || !base.seededAt;
  const needsBinance =
    options.forceRefresh === true ||
    needsSeed ||
    base.binance.length === 0 ||
    !isFresh(base.lastFetchedAt, now, RATE_HISTORY_CACHE_TTL_MS);
  const needsBcv =
    options.forceRefresh === true ||
    needsSeed ||
    base.bcv.length === 0 ||
    !isFresh(base.lastBcvFetchedAt, now, BCV_HISTORY_CACHE_TTL_MS);

  if (!needsBinance && !needsBcv) {
    await saveRateHistoryCache(base, storage);
    return [...base.binance, ...base.bcv];
  }

  const binanceSince = needsSeed
    ? getRateHistoryRetentionCutoff(now) -
      RATE_HISTORY_FETCH_OVERLAP_DAYS * DAY_MS
    : Math.max(
        getRateHistoryRetentionCutoff(now),
        latestTimestamp(base.binance),
      ) -
      RATE_HISTORY_FETCH_OVERLAP_DAYS * DAY_MS;

  let binanceSamples: HistoricalRateSample[] = [];
  let bcvSamples: HistoricalRateSample[] = [];
  let binanceFetched = false;
  let bcvFetched = false;
  let binanceError: unknown = null;
  let bcvError: unknown = null;

  const tasks: Array<Promise<void>> = [];

  if (needsBinance) {
    tasks.push(
      fetchBinance(binanceSince)
        .then((samples) => {
          binanceSamples = samples;
          binanceFetched = true;
        })
        .catch((error: unknown) => {
          binanceError = error;
        }),
    );
  }

  if (needsBcv) {
    tasks.push(
      fetchBcv()
        .then((samples) => {
          bcvSamples = samples;
          bcvFetched = true;
        })
        .catch((error: unknown) => {
          bcvError = error;
        }),
    );
  }

  await Promise.all(tasks);

  const bcvCutoff = getBcvHistoryRetentionCutoff(now);
  const merged: RateHistoryCache = {
    version: RATE_HISTORY_CACHE_VERSION,
    lastFetchedAt: binanceFetched
      ? new Date(now).toISOString()
      : base.lastFetchedAt,
    lastBcvFetchedAt: bcvFetched
      ? new Date(now).toISOString()
      : base.lastBcvFetchedAt,
    seededAt:
      base.seededAt ?? (binanceFetched ? new Date(now).toISOString() : null),
    binance: mergeRateHistorySamples(base.binance, binanceSamples),
    bcv: mergeRateHistorySamples(
      base.bcv,
      bcvSamples.filter((sample) => Date.parse(sample.capturedAt) >= bcvCutoff),
    ),
  };

  if (merged.binance.length === 0) {
    throw binanceError ?? new Error('No hay muestras históricas P2P disponibles.');
  }
  if (merged.bcv.length === 0) {
    throw bcvError ?? new Error('No hay muestras históricas BCV disponibles.');
  }

  const pruned = pruneRateHistoryCache(merged, now);
  await saveRateHistoryCache(pruned, storage);

  return [...pruned.binance, ...pruned.bcv];
}
