import { calculate, getExchangeGap } from '../../domain/calculations';
import type { BankProfile, PurchaseRecord } from '../../domain/types';
import type { HistoricalRateSample } from './ratesApi';

export type HistoryRange = '24h' | '7d' | '30d' | '90d';
export type HistoryGranularity = 'hour' | 'open-close' | 'daily-average';

export interface RateHistoryPoint {
  timestamp: number;
  label: string;
  open?: number;
  close?: number;
  min?: number;
  max?: number;
  average?: number;
  p2p?: number;
  bcv?: number;
  gapPct?: number;
  sampleCount: number;
}

export interface RateHistorySeries {
  range: HistoryRange;
  granularity: HistoryGranularity;
  points: RateHistoryPoint[];
}

interface RateSnapshot {
  timestamp: number;
  p2p: number;
  bcv: number;
  gapPct: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const hourFormatter = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit',
  minute: '2-digit',
});

const dayFormatter = new Intl.DateTimeFormat('es-VE', {
  day: '2-digit',
  month: 'short',
});

export function getRangeDays(range: HistoryRange): number {
  return range === '24h' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfLocalHour(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

function buildSnapshots(samples: HistoricalRateSample[]): RateSnapshot[] {
  const binanceSamples = samples
    .filter((sample) => sample.source === 'binance')
    .map((sample) => ({ timestamp: Date.parse(sample.capturedAt), p2p: sample.buyRate }))
    .filter((sample) => Number.isFinite(sample.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
  const bcvSamples = samples
    .filter((sample) => sample.source === 'bcv')
    .map((sample) => ({ timestamp: Date.parse(sample.capturedAt), bcv: sample.buyRate }))
    .filter((sample) => Number.isFinite(sample.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  const snapshots: RateSnapshot[] = [];
  let bcvIndex = 0;
  let latestBcv: { timestamp: number; bcv: number } | null = null;
  const maxBcvAgeMs = 72 * HOUR_MS;

  for (const binance of binanceSamples) {
    while (bcvIndex < bcvSamples.length && bcvSamples[bcvIndex].timestamp <= binance.timestamp) {
      latestBcv = bcvSamples[bcvIndex];
      bcvIndex += 1;
    }

    if (!latestBcv || binance.timestamp - latestBcv.timestamp > maxBcvAgeMs) continue;

    snapshots.push({
      timestamp: binance.timestamp,
      p2p: binance.p2p,
      bcv: latestBcv.bcv,
      gapPct: getExchangeGap(latestBcv.bcv, binance.p2p).pct,
    });
  }

  return snapshots;
}

function buildHourlySeries(
  snapshots: RateSnapshot[],
  now: number,
): RateHistorySeries {
  const currentHour = startOfLocalHour(now);
  const start = currentHour - 23 * HOUR_MS;
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const timestamp = start + index * HOUR_MS;
    return {
      timestamp,
      label: hourFormatter.format(new Date(timestamp)),
      last: undefined as RateSnapshot | undefined,
    };
  });

  for (const snapshot of snapshots) {
    if (snapshot.timestamp < start || snapshot.timestamp > now) continue;
    const index = Math.floor((snapshot.timestamp - start) / HOUR_MS);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].last = snapshot;
  }

  return {
    range: '24h',
    granularity: 'hour',
    points: buckets.map((bucket) => {
      if (!bucket.last) {
        return { timestamp: bucket.timestamp, label: bucket.label, sampleCount: 0 };
      }
      return {
        timestamp: bucket.timestamp,
        label: bucket.label,
        p2p: bucket.last.p2p,
        bcv: bucket.last.bcv,
        gapPct: bucket.last.gapPct,
        sampleCount: 1,
      };
    }),
  };
}

function buildSevenDaySeries(
  snapshots: RateSnapshot[],
  now: number,
): RateHistorySeries {
  const firstDay = startOfLocalDay(now) - 6 * DAY_MS;
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const timestamp = firstDay + index * DAY_MS;
    return {
      timestamp,
      label: dayFormatter.format(new Date(timestamp)),
      values: [] as RateSnapshot[],
    };
  });

  for (const snapshot of snapshots) {
    if (snapshot.timestamp < firstDay || snapshot.timestamp > now) continue;
    const index = Math.floor((startOfLocalDay(snapshot.timestamp) - firstDay) / DAY_MS);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].values.push(snapshot);
  }

  return {
    range: '7d',
    granularity: 'open-close',
    points: buckets.map((bucket) => {
      const values = bucket.values.sort((left, right) => left.timestamp - right.timestamp);
      if (values.length === 0) {
        return { timestamp: bucket.timestamp, label: bucket.label, sampleCount: 0 };
      }

      const p2pValues = values.map((snapshot) => snapshot.p2p);
      const open = p2pValues[0];
      const close = p2pValues[p2pValues.length - 1];
      const min = Math.min(...p2pValues);
      const max = Math.max(...p2pValues);
      const average =
        p2pValues.reduce((total, value) => total + value, 0) / p2pValues.length;
      const gapPct =
        values.reduce((total, snapshot) => total + snapshot.gapPct, 0) / values.length;

      return {
        timestamp: bucket.timestamp,
        label: bucket.label,
        open,
        close,
        min,
        max,
        average,
        p2p: close,
        bcv: values[values.length - 1].bcv,
        gapPct,
        sampleCount: values.length,
      };
    }),
  };
}

function buildDailyAverageSeries(
  snapshots: RateSnapshot[],
  now: number,
  range: '30d' | '90d',
  days: number,
): RateHistorySeries {
  const firstDay = startOfLocalDay(now) - (days - 1) * DAY_MS;
  const buckets = Array.from({ length: days }, (_, index) => {
    const timestamp = firstDay + index * DAY_MS;
    return {
      timestamp,
      label: dayFormatter.format(new Date(timestamp)),
      values: [] as RateSnapshot[],
    };
  });

  for (const snapshot of snapshots) {
    if (snapshot.timestamp < firstDay || snapshot.timestamp > now) continue;
    const index = Math.floor((startOfLocalDay(snapshot.timestamp) - firstDay) / DAY_MS);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].values.push(snapshot);
  }

  return {
    range,
    granularity: 'daily-average',
    points: buckets.map((bucket) => {
      if (bucket.values.length === 0) {
        return { timestamp: bucket.timestamp, label: bucket.label, sampleCount: 0 };
      }

      const average =
        bucket.values.reduce((total, snapshot) => total + snapshot.p2p, 0) /
        bucket.values.length;
      const gapPct =
        bucket.values.reduce((total, snapshot) => total + snapshot.gapPct, 0) /
        bucket.values.length;
      const bcv = bucket.values[bucket.values.length - 1].bcv;

      return {
        timestamp: bucket.timestamp,
        label: bucket.label,
        average,
        p2p: average,
        bcv,
        gapPct,
        sampleCount: bucket.values.length,
      };
    }),
  };
}

export function buildRateHistory(
  samples: HistoricalRateSample[],
  range: HistoryRange,
  now = Date.now(),
): RateHistorySeries {
  const snapshots = buildSnapshots(samples);
  if (range === '24h') return buildHourlySeries(snapshots, now);
  if (range === '7d') return buildSevenDaySeries(snapshots, now);

  const days = range === '30d' ? 30 : 90;
  return buildDailyAverageSeries(snapshots, now, range, days);
}

export interface BreakEvenChartPoint {
  timestamp: number;
  label: string;
  rate: number;
}

function profileFromPurchase(purchase: PurchaseRecord): BankProfile {
  const { snapshot } = purchase;

  return {
    id: purchase.profileId,
    name: purchase.profileName,
    cardCommissionPct: snapshot.cardCommissionPct,
    cardCommissionBase: snapshot.cardCommissionBase,
    binanceDepositPct: snapshot.binanceDepositPct,
    binanceDepositFixedUsd: snapshot.binanceDepositFixedUsd,
    interbankEnabled: snapshot.interbankEnabled,
    interbankPct: snapshot.interbankPct,
    interbankBase: snapshot.interbankBase,
    igtfEnabled: snapshot.igtfEnabled,
    igtfPct: snapshot.igtfPct,
    igtfBase: snapshot.igtfBase,
    slippageEnabled: snapshot.slippageEnabled,
    slippagePct: snapshot.slippagePct,
    notes: '',
    createdAt: purchase.createdAt,
    updatedAt: purchase.createdAt,
  };
}

export function buildBreakEvenSeries(
  points: readonly RateHistoryPoint[],
  purchase: PurchaseRecord | null,
): BreakEvenChartPoint[] {
  if (!purchase || purchase.breakEvenRate <= 0) return [];

  const profile = profileFromPurchase(purchase);
  const options = {
    interbankEnabled: purchase.snapshot.interbankEnabled,
    igtfEnabled: purchase.snapshot.igtfEnabled,
    slippageEnabled: purchase.snapshot.slippageEnabled,
  };
  const series: BreakEvenChartPoint[] = [];

  for (const point of points) {
    if (
      point.bcv === undefined ||
      point.bcv <= 0 ||
      point.p2p === undefined ||
      point.p2p <= 0
    ) {
      continue;
    }

    try {
      const result = calculate({
        mode: purchase.mode,
        amount: purchase.inputAmount,
        bcvRate: point.bcv,
        binanceRate: point.p2p,
        profile,
        options,
      });

      if (
        Number.isFinite(result.breakEvenRate) &&
        result.breakEvenRate > 0
      ) {
        series.push({
          timestamp: point.timestamp,
          label: point.label,
          rate: result.breakEvenRate,
        });
      }
    } catch {
      // Skip days where the synthetic operation is not viable.
    }
  }

  return series;
}
