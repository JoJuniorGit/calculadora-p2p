const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares';
const BINANCE_SERVER_URL = '/api/binance-rate';
const CRIPTOYA_BINANCE_URL = 'https://criptoya.com/api/binancep2p/USDT/VES/1';
const YADIO_RATES_URL = 'https://api.yadio.io/exrates/USD';
const REQUEST_TIMEOUT_MS = 8_000;
const FALLBACK_TIMEOUT_MS = 6_000;

export interface FetchedRate {
  value: number;
  provider: string;
}

export type HistoricalSource = 'binance' | 'bcv';

export interface HistoricalRateSample {
  capturedAt: string;
  source: HistoricalSource;
  buyRate: number;
  sellRate: number | null;
  /** Which P2P series produced the rate; absent for BCV samples. */
  priceMethod?: 'median' | 'average';
}

export interface HistoricalRateForDate {
  bcv: {
    value: number;
    capturedAt: string;
    forwardFilled: boolean;
  };
  binance: {
    value: number;
    capturedAt: string;
    method: 'median' | 'average';
  };
}

export type HistoricalRateLookupErrorCode =
  | 'invalid-date'
  | 'future-date'
  | 'outside-lookback'
  | 'no-binance-samples'
  | 'no-p2p-samples'
  | 'no-bcv-sample';

export class HistoricalRateLookupError extends Error {
  constructor(
    readonly code: HistoricalRateLookupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HistoricalRateLookupError';
  }
}

interface RecordValue {
  [key: string]: unknown;
}

export type RateApiErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'format'
  | 'data'
  | 'unknown';

export class RateApiError extends Error {
  constructor(
    message: string,
    readonly kind: RateApiErrorKind = 'unknown',
  ) {
    super(message);
    this.name = 'RateApiError';
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const parsed = typeof value === 'number' ? value : Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function withTimeout<T>(
  service: string,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RateApiError(
        `La consulta a ${service} superó el límite de ${Math.round(timeoutMs / 1000)} segundos.`,
        'timeout',
      );
    }
    if (error instanceof RateApiError || error instanceof HistoricalRateLookupError) {
      throw error;
    }
    throw new RateApiError(
      `No se pudo consultar ${service}. Verifica la conexión, los permisos CORS o la disponibilidad del servicio.`,
      'network',
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDolarApiRate(source: 'oficial' | 'paralelo'): Promise<FetchedRate> {
  const service = `DolarApi (${source})`;

  return withTimeout(service, async (signal) => {
    const response = await fetch(DOLAR_API_URL, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new RateApiError(`${service} respondió con el estado ${response.status}.`, 'http');
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`, 'format');
    }

    const entry = payload.find(
      (candidate): candidate is RecordValue =>
        isRecord(candidate) &&
        typeof candidate.fuente === 'string' &&
        candidate.fuente.toLowerCase() === source,
    );

    if (!entry) {
      throw new RateApiError(
        `No se encontró la tasa ${source} en la respuesta de DolarApi.`,
        'data',
      );
    }

    const value = parsePositiveNumber(entry.promedio);
    if (value === null) {
      throw new RateApiError(`La tasa ${source} recibida de DolarApi no es válida.`, 'data');
    }

    return { value, provider: service };
  });
}

async function fetchBinanceProxyRate(): Promise<FetchedRate> {
  const service = 'Binance P2P venta';

  return withTimeout(service, async (signal) => {
    const response = await fetch('/binance-api/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'VES',
        merchantCheck: false,
        page: 1,
        rows: 10,
        payTypes: [],
        // The app sells USD/USDT for Bs.S, so the relevant P2P side is SELL
        // (buyer ads), not BUY (seller ads).
        tradeType: 'SELL',
      }),
      signal,
    });

    if (!response.ok) {
      throw new RateApiError(`${service} respondió con el estado ${response.status}.`, 'http');
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`, 'format');
    }

    const prices = payload.data.flatMap((item) => {
      if (!isRecord(item) || !isRecord(item.adv)) return [];
      const price = parsePositiveNumber(item.adv.price);
      return price === null ? [] : [price];
    });

    if (prices.length === 0) {
      throw new RateApiError(`${service} no devolvió precios válidos.`, 'data');
    }

    prices.sort((left, right) => left - right);
    const middle = Math.floor(prices.length / 2);
    const value =
      prices.length % 2 === 0
        ? (prices[middle - 1] + prices[middle]) / 2
        : prices[middle];

    if (!Number.isFinite(value) || value <= 0) {
      throw new RateApiError(`${service} no devolvió una tasa válida.`, 'data');
    }

    return { value, provider: service };
  });
}

export function fetchBcvRate(): Promise<FetchedRate> {
  return fetchDolarApiRate('oficial');
}

async function fetchCriptoyaBinanceRate(): Promise<FetchedRate> {
  const service = 'CriptoYa (Binance P2P)';

  return withTimeout(
    service,
    async (signal) => {
      const response = await fetch(CRIPTOYA_BINANCE_URL, {
        headers: { Accept: 'application/json' },
        signal,
      });

      if (!response.ok) {
        throw new RateApiError(`${service} respondió con el estado ${response.status}.`, 'http');
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`, 'format');
      }

      const value = parsePositiveNumber(payload.bid) ?? parsePositiveNumber(payload.ask);
      if (value === null) {
        throw new RateApiError(`${service} no devolvió una tasa válida.`, 'data');
      }

      return { value, provider: service };
    },
    FALLBACK_TIMEOUT_MS,
  );
}

async function fetchYadioRate(): Promise<FetchedRate> {
  const service = 'Yadio (USD/VES)';

  return withTimeout(
    service,
    async (signal) => {
      const response = await fetch(YADIO_RATES_URL, {
        headers: { Accept: 'application/json' },
        signal,
      });

      if (!response.ok) {
        throw new RateApiError(`${service} respondió con el estado ${response.status}.`, 'http');
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !isRecord(payload.USD)) {
        throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`, 'format');
      }

      const value = parsePositiveNumber(payload.USD.VES);
      if (value === null) {
        throw new RateApiError(`${service} no devolvió una tasa válida.`, 'data');
      }

      return { value, provider: service };
    },
    FALLBACK_TIMEOUT_MS,
  );
}

async function fetchBinanceServerRate(): Promise<FetchedRate> {
  const service = 'Binance P2P (proxy)';

  return withTimeout(
    service,
    async (signal) => {
      const response = await fetch(BINANCE_SERVER_URL, {
        headers: { Accept: 'application/json' },
        signal,
      });

      if (!response.ok) {
        throw new RateApiError(`${service} respondió con el estado ${response.status}.`, 'http');
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`, 'format');
      }

      const value = parsePositiveNumber(payload.value);
      if (value === null) {
        throw new RateApiError(`${service} no devolvió una tasa válida.`, 'data');
      }

      return {
        value,
        provider:
          typeof payload.provider === 'string' && payload.provider.trim() !== ''
            ? payload.provider
            : service,
      };
    },
    FALLBACK_TIMEOUT_MS,
  );
}

function getBinanceRateSources(): Array<() => Promise<FetchedRate>> {
  const sources: Array<() => Promise<FetchedRate>> = [];
  sources.push(import.meta.env.DEV ? fetchBinanceProxyRate : fetchBinanceServerRate);
  sources.push(
    fetchCriptoyaBinanceRate,
    () => fetchDolarApiRate('paralelo'),
    fetchYadioRate,
  );
  return sources;
}

export async function fetchBinanceRate(): Promise<FetchedRate> {
  const failures: string[] = [];

  for (const source of getBinanceRateSources()) {
    try {
      return await source();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  throw new RateApiError(
    `No se pudo obtener la tasa Binance P2P desde ninguna de las APIs de respaldo. ${failures.join(' ')}`,
    'network',
  );
}

const HISTORY_API_BASE = 'https://dolar-vzla.rafnixg.dev/api/v1/history';
const HISTORY_PAGE_SIZE = 1_000;
const INCREMENTAL_HISTORY_PAGE_SIZE = 200;
const HISTORY_MAX_SKIP = 30_000;
const HISTORY_TIMEOUT_MS = 30_000;
const HISTORY_LOOKBACK_DAYS = 365;
const MAX_BCV_FORWARD_FILL_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function localDateStamp(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnlyLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function dateOnlyDayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !parseDateOnlyLocal(value)) return null;

  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / DAY_MS);
}

function getBcvCalendarDate(sample: HistoricalRateSample): string | null {
  const dateOnly = sample.capturedAt.slice(0, 10);
  return dateOnlyDayNumber(dateOnly) === null ? null : dateOnly;
}

function getLocalDateFromTimestamp(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) return null;
  return localDateStamp(new Date(timestamp));
}

async function fetchHistoryPages(
  endpoint: string,
  params: Record<string, string>,
  signal: AbortSignal,
  extract: (item: RecordValue) => HistoricalRateSample[],
  stopBefore: number,
  pageSize = HISTORY_PAGE_SIZE,
): Promise<HistoricalRateSample[]> {
  const samples: HistoricalRateSample[] = [];
  let skip = 0;

  while (skip < HISTORY_MAX_SKIP) {
    const query = new URLSearchParams({
      ...params,
      skip: String(skip),
      limit: String(pageSize),
    });
    const response = await fetch(`${HISTORY_API_BASE}/${endpoint}?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new RateApiError(
        `Histórico P2P/BCV (dolar-vzla.rafnixg.dev) respondió con el estado ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.currencies)) {
      throw new RateApiError(
        'Histórico P2P/BCV (dolar-vzla.rafnixg.dev) devolvió una respuesta con formato inválido.',
      );
    }

    const page = payload.currencies;
    for (const item of page) {
      if (isRecord(item)) samples.push(...extract(item));
    }

    const oldestTimestamp = page.reduce((oldest, item) => {
      if (!isRecord(item) || typeof item.date !== 'string') return oldest;
      const timestamp = Date.parse(item.date);
      return Number.isFinite(timestamp) ? Math.min(oldest, timestamp) : oldest;
    }, Number.POSITIVE_INFINITY);

    if (page.length < pageSize || oldestTimestamp < stopBefore) break;
    skip += pageSize;
  }

  return samples;
}

function extractBinanceHistory(item: RecordValue): HistoricalRateSample[] {
  if (typeof item.date !== 'string' || item.date.trim() === '') return [];
  const median = parsePositiveNumber(item.median_price);
  const average = parsePositiveNumber(item.average_price);
  const rate = median ?? average;
  if (rate === null) return [];
  return [
    {
      capturedAt: item.date,
      source: 'binance',
      buyRate: rate,
      sellRate: null,
      priceMethod: median !== null ? 'median' : 'average',
    },
  ];
}

async function fetchBinanceHistory(
  since: number,
  signal: AbortSignal,
  pageSize = HISTORY_PAGE_SIZE,
): Promise<HistoricalRateSample[]> {
  const startDate = new Date(since).toISOString();
  const samples = await fetchHistoryPages(
    'binance',
    {
      fiat: 'VES',
      asset: 'USDT',
      trade_type: 'SELL',
      start_date: startDate,
    },
    signal,
    extractBinanceHistory,
    since,
    pageSize,
  );

  return samples.filter((sample) => {
    const timestamp = Date.parse(sample.capturedAt);
    return Number.isFinite(timestamp) && timestamp >= since;
  });
}

async function fetchBcvHistory(signal: AbortSignal): Promise<HistoricalRateSample[]> {
  const service = 'BCV histórico (DolarApi)';
  const response = await fetch('https://ve.dolarapi.com/v1/historicos/dolares/oficial', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new RateApiError(`${service} respondió con el estado ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`);
  }

  return payload.flatMap((item): HistoricalRateSample[] => {
    if (!isRecord(item) || typeof item.fecha !== 'string' || item.fecha.trim() === '') {
      return [];
    }
    const rate = parsePositiveNumber(item.promedio);
    if (rate === null) return [];
    const capturedAt = item.fecha.includes('T')
      ? item.fecha
      : `${item.fecha}T00:00:00.000Z`;
    return [{ capturedAt, source: 'bcv', buyRate: rate, sellRate: null }];
  });
}

export async function fetchRateHistory(days: number): Promise<HistoricalRateSample[]> {
  const service = 'Histórico P2P/BCV (dolar-vzla.rafnixg.dev + DolarApi)';
  const safeDays = Math.max(1, Math.min(HISTORY_LOOKBACK_DAYS, Math.round(days)));
  const stopBefore = Date.now() - safeDays * DAY_MS;

  return withTimeout(
    service,
    async (signal) => {
      const [binanceSamples, bcvSamples] = await Promise.all([
        fetchBinanceHistory(stopBefore, signal),
        fetchBcvHistory(signal),
      ]);

      if (binanceSamples.length === 0) {
        throw new HistoricalRateLookupError(
          'no-binance-samples',
          `${service} no devolvió muestras P2P válidas.`,
        );
      }
      if (bcvSamples.length === 0) {
        throw new RateApiError(`${service} no devolvió muestras BCV válidas.`);
      }

      return [...binanceSamples, ...bcvSamples];
    },
    HISTORY_TIMEOUT_MS,
  );
}

export async function fetchBinanceRateHistorySince(
  since: number,
): Promise<HistoricalRateSample[]> {
  const service = 'Histórico P2P (dolar-vzla.rafnixg.dev)';
  const safeSince =
    Number.isFinite(since) && since > 0 ? since : Date.now() - 90 * DAY_MS;
  const gapDays = (Date.now() - safeSince) / DAY_MS;
  const pageSize =
    gapDays > 7 ? HISTORY_PAGE_SIZE : INCREMENTAL_HISTORY_PAGE_SIZE;

  return withTimeout(
    service,
    (signal) => fetchBinanceHistory(safeSince, signal, pageSize),
    HISTORY_TIMEOUT_MS,
  );
}

export async function fetchBcvRateHistory(): Promise<HistoricalRateSample[]> {
  const service = 'BCV histórico (DolarApi)';
  return withTimeout(
    service,
    (signal) => fetchBcvHistory(signal),
    HISTORY_TIMEOUT_MS,
  );
}

export async function fetchHistoricalRateForDate(
  date: string,
): Promise<HistoricalRateForDate> {
  const targetDate = parseDateOnlyLocal(date);
  if (!targetDate) {
    throw new HistoricalRateLookupError(
      'invalid-date',
      'La fecha debe ser válida y tener el formato AAAA-MM-DD.',
    );
  }

  const now = new Date();
  if (date > localDateStamp(now)) {
    throw new HistoricalRateLookupError(
      'future-date',
      'No se pueden consultar tasas para una fecha futura.',
    );
  }

  const todayStart = parseDateOnlyLocal(localDateStamp(now));
  if (!todayStart) {
    throw new HistoricalRateLookupError('invalid-date', 'La fecha actual no es válida.');
  }
  const lookbackStart = new Date(todayStart);
  lookbackStart.setDate(lookbackStart.getDate() - HISTORY_LOOKBACK_DAYS);
  if (targetDate.getTime() < lookbackStart.getTime()) {
    throw new HistoricalRateLookupError(
      'outside-lookback',
      `La fecha está fuera del histórico disponible de ${HISTORY_LOOKBACK_DAYS} días.`,
    );
  }

  const daysToFetch = Math.min(
    HISTORY_LOOKBACK_DAYS,
    Math.max(
      1,
      Math.ceil((todayStart.getTime() - targetDate.getTime()) / DAY_MS) + 1,
    ),
  );
  const samples = await fetchRateHistory(daysToFetch);
  const targetDayNumber = dateOnlyDayNumber(date);
  if (targetDayNumber === null) {
    throw new HistoricalRateLookupError('invalid-date', 'La fecha no es válida.');
  }

  const p2pSamples = samples
    .filter((sample) => sample.source === 'binance')
    .map((sample) => ({
      sample,
      timestamp: Date.parse(sample.capturedAt),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.timestamp) &&
        getLocalDateFromTimestamp(entry.timestamp) === date,
    )
    .sort(
      (left, right) =>
        left.sample.buyRate - right.sample.buyRate ||
        left.timestamp - right.timestamp,
    );

  if (p2pSamples.length === 0) {
    throw new HistoricalRateLookupError(
      'no-p2p-samples',
      `No hay muestras históricas de Binance P2P para ${date}. Ingresa ambas tasas manualmente.`,
    );
  }

  const middle = Math.floor(p2pSamples.length / 2);
  const binanceValue =
    p2pSamples.length % 2 === 0
      ? (p2pSamples[middle - 1].sample.buyRate + p2pSamples[middle].sample.buyRate) / 2
      : p2pSamples[middle].sample.buyRate;
  const binanceCapturedAt = p2pSamples[middle].sample.capturedAt;
  const binanceMethod = p2pSamples.some(
    (entry) => entry.sample.priceMethod === 'average',
  )
    ? 'average'
    : 'median';

  const bcvSamples = samples.flatMap((sample) => {
    if (sample.source !== 'bcv') return [];
    const dateOnly = getBcvCalendarDate(sample);
    if (dateOnly === null) return [];
    const dayNumber = dateOnlyDayNumber(dateOnly);
    const timestamp = Date.parse(sample.capturedAt);
    if (dayNumber === null || !Number.isFinite(timestamp)) return [];
    return [{ sample, date: dateOnly, dayNumber, timestamp }];
  });
  const exactBcv = bcvSamples
    .filter((entry) => entry.dayNumber === targetDayNumber)
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  if (exactBcv) {
    return {
      bcv: {
        value: exactBcv.sample.buyRate,
        capturedAt: exactBcv.sample.capturedAt,
        forwardFilled: false,
      },
      binance: {
        value: binanceValue,
        capturedAt: binanceCapturedAt,
        method: binanceMethod,
      },
    };
  }

  const priorBcv = bcvSamples
    .filter((entry) => {
      if (entry.dayNumber === null || entry.dayNumber >= targetDayNumber) return false;
      const ageInDays = targetDayNumber - entry.dayNumber;
      return ageInDays <= MAX_BCV_FORWARD_FILL_DAYS;
    })
    .sort((left, right) => {
      const dayDifference = (right.dayNumber ?? 0) - (left.dayNumber ?? 0);
      return dayDifference !== 0 ? dayDifference : right.timestamp - left.timestamp;
    })[0];

  if (!priorBcv) {
    throw new HistoricalRateLookupError(
      'no-bcv-sample',
      `No hay una tasa BCV publicada para ${date} ni una tasa anterior en los últimos ${MAX_BCV_FORWARD_FILL_DAYS} días.`,
    );
  }

  return {
    bcv: {
      value: priorBcv.sample.buyRate,
      capturedAt: priorBcv.sample.capturedAt,
      forwardFilled: true,
    },
    binance: {
      value: binanceValue,
      capturedAt: binanceCapturedAt,
      method: binanceMethod,
    },
  };
}

