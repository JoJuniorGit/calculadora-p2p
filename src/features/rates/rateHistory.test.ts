import { describe, expect, it } from 'vitest';
import { calculate, getExchangeGap } from '../../domain/calculations';
import type { BankProfile, PurchaseRecord } from '../../domain/types';
import type { HistoricalRateSample } from './ratesApi';
import { buildBreakEvenSeries, buildRateHistory } from './rateHistory';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PURCHASE_TIMESTAMP = '2026-11-11T12:00:00.000Z';

function createProfile(): BankProfile {
  return {
    id: 'profile-1',
    name: 'Banco de prueba',
    cardCommissionPct: 0,
    cardCommissionBase: 'ves',
    binanceDepositPct: 0,
    binanceDepositFixedUsd: 0,
    interbankEnabled: false,
    interbankPct: 0,
    interbankBase: 'initial',
    igtfEnabled: false,
    igtfPct: 0,
    igtfBase: 'investment',
    slippageEnabled: false,
    slippagePct: 0,
    notes: '',
    createdAt: PURCHASE_TIMESTAMP,
    updatedAt: PURCHASE_TIMESTAMP,
  };
}

function createPurchase(): PurchaseRecord {
  const profile = createProfile();
  const result = calculate({
    mode: 'bs',
    amount: 10_000,
    bcvRate: 900,
    binanceRate: 1_070,
    profile,
    options: {
      interbankEnabled: false,
      igtfEnabled: false,
      slippageEnabled: false,
    },
  });

  return {
    id: 'purchase-1',
    createdAt: PURCHASE_TIMESTAMP,
    profileId: profile.id,
    profileName: profile.name,
    mode: result.mode,
    inputAmount: result.inputAmount,
    amountBs: result.amountBs,
    bcvRate: 900,
    binanceRate: 1_070,
    snapshot: result.snapshot,
    usdBought: result.usdBought,
    usdForBinance: result.usdForBinance,
    usdDeposited: result.usdDeposited,
    totalCostBs: result.totalCostBs,
    estimatedBsOut: result.bsOut,
    estimatedProfitBs: result.netProfitBs,
    estimatedRoiPct: result.roiPct,
    breakEvenRate: result.breakEvenRate,
    requestedInvestmentVes: result.amountBs,
    requestedUsd: result.usdBought,
    accreditationType: 'TOTAL',
    accreditedUsd: result.usdBought,
    accreditationRatePercent: 100,
    executedInvestmentVes: result.amountBs,
    refundedVes: 0,
    accreditationConfirmedAt: null,
    status: 'pending',
    statusHistory: [],
    execution: null,
    notes: '',
  };
}

function pair(timestamp: number, bcv: number, p2p: number): HistoricalRateSample[] {
  const capturedAt = new Date(timestamp).toISOString();
  return [
    { capturedAt, source: 'bcv', buyRate: bcv, sellRate: null },
    { capturedAt, source: 'binance', buyRate: p2p, sellRate: p2p - 1 },
  ];
}

function localDayWithTime(now: number, daysAgo: number, hours: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, 0, 0, 0);
  return date.getTime();
}

describe('buildRateHistory', () => {
  it('builds 24 hourly buckets and keeps only the last sample per hour', () => {
    const now = new Date('2026-11-11T18:30:00').getTime();
    const samples = [
      ...pair(localDayWithTime(now, 0, 15), 900, 1_080),
      ...pair(localDayWithTime(now, 0, 16), 901, 1_081),
      ...pair(localDayWithTime(now, 0, 16) + 10 * 60 * 1000, 902, 1_082),
      ...pair(localDayWithTime(now, 0, 18), 903, 1_083),
    ];

    const series = buildRateHistory(samples, '24h', now);

    expect(series.granularity).toBe('hour');
    expect(series.points).toHaveLength(24);
    expect(series.points.filter((point) => point.p2p !== undefined)).toHaveLength(3);

    const lastHour = series.points.find((point) => point.timestamp === localDayWithTime(now, 0, 18));
    expect(lastHour).toMatchObject({
      p2p: 1_083,
      bcv: 903,
      sampleCount: 1,
    });
    expect(lastHour?.gapPct).toBeCloseTo(getExchangeGap(903, 1_083).pct, 10);
    expect(series.points.find((point) => point.timestamp === localDayWithTime(now, 0, 16))?.p2p).toBe(
      1_082,
    );
  });

  it('builds seven daily buckets with open, close, min, max and average', () => {
    const now = new Date('2026-11-11T18:30:00').getTime();
    const samples = [
      ...pair(localDayWithTime(now, 6, 10), 880, 1_060),
      ...pair(localDayWithTime(now, 0, 9), 900, 1_070),
      ...pair(localDayWithTime(now, 0, 13), 901, 1_100),
      ...pair(localDayWithTime(now, 0, 17), 902, 1_080),
    ];

    const series = buildRateHistory(samples, '7d', now);
    const today = series.points.find(
      (point) => point.timestamp === localDayWithTime(now, 0, 0),
    );

    expect(series.granularity).toBe('open-close');
    expect(series.points).toHaveLength(7);
    expect(today).toMatchObject({
      open: 1_070,
      close: 1_080,
      min: 1_070,
      max: 1_100,
      sampleCount: 3,
    });
    expect(today?.average).toBeCloseTo(1_083.3333333, 5);
    expect(today?.gapPct).toBeCloseTo(
      (getExchangeGap(900, 1_070).pct +
        getExchangeGap(901, 1_100).pct +
        getExchangeGap(902, 1_080).pct) /
        3,
      10,
    );
  });

  it('builds 30 daily averages and ignores samples outside the range', () => {
    const now = new Date('2026-11-11T18:30:00').getTime();
    const samples = [
      ...pair(now - 40 * DAY, 800, 1_000),
      ...pair(localDayWithTime(now, 0, 9), 900, 1_000),
      ...pair(localDayWithTime(now, 0, 10), 900, 1_100),
    ];

    const series = buildRateHistory(samples, '30d', now);
    const today = series.points.find(
      (point) => point.timestamp === localDayWithTime(now, 0, 0),
    );

    expect(series.granularity).toBe('daily-average');
    expect(series.points).toHaveLength(30);
    expect(today).toMatchObject({
      average: 1_050,
      p2p: 1_050,
      bcv: 900,
      sampleCount: 2,
    });
  });

  it('returns empty daily buckets instead of inventing values', () => {
    const now = new Date('2026-11-11T18:30:00').getTime();
    const samples = pair(localDayWithTime(now, 0, 9), 900, 1_000);

    const series = buildRateHistory(samples, '7d', now);

    expect(series.points).toHaveLength(7);
    expect(series.points.filter((point) => point.p2p !== undefined)).toHaveLength(1);
    expect(series.points.filter((point) => point.sampleCount === 0)).toHaveLength(6);
  });
});

describe('buildBreakEvenSeries', () => {
  it('builds one break-even point per day using that day BCV and the reference purchase', () => {
    const now = new Date('2026-11-11T18:30:00').getTime();
    const samples = [
      ...pair(localDayWithTime(now, 6, 10), 880, 1_060),
      ...pair(localDayWithTime(now, 0, 9), 900, 1_070),
      ...pair(localDayWithTime(now, 0, 13), 901, 1_100),
      ...pair(localDayWithTime(now, 0, 17), 902, 1_080),
    ];
    const series = buildRateHistory(samples, '7d', now);
    const purchase = createPurchase();
    const breakEven = buildBreakEvenSeries(series.points, purchase);

    expect(breakEven).toHaveLength(2);
    expect(breakEven.map((point) => point.timestamp)).toEqual([
      localDayWithTime(now, 6, 0),
      localDayWithTime(now, 0, 0),
    ]);
    expect(breakEven[0].rate).toBeGreaterThan(880);
    expect(breakEven[1].rate).toBeGreaterThan(900);
    expect(breakEven[0].rate).not.toBe(breakEven[1].rate);

    const today = series.points.find(
      (point) => point.timestamp === localDayWithTime(now, 0, 0),
    );
    expect(today?.bcv).toBeDefined();
    expect(today?.p2p).toBeDefined();

    const expected = calculate({
      mode: purchase.mode,
      amount: purchase.inputAmount,
      bcvRate: today?.bcv as number,
      binanceRate: today?.p2p as number,
      profile: createProfile(),
      options: {
        interbankEnabled: false,
        igtfEnabled: false,
        slippageEnabled: false,
      },
    }).breakEvenRate;

    expect(breakEven[1].rate).toBeCloseTo(expected, 10);
  });

  it('returns no points when there is no reference purchase', () => {
    const now = new Date('2026-11-11T18:30:00').getTime();
    const series = buildRateHistory(
      pair(localDayWithTime(now, 0, 9), 900, 1_000),
      '7d',
      now,
    );

    expect(buildBreakEvenSeries(series.points, null)).toEqual([]);
  });
});
