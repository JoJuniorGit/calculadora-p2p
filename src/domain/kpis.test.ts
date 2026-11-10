import { describe, expect, it } from 'vitest';
import type {
  CalculationSnapshot,
  PurchaseExecution,
  PurchaseRecord,
  PurchaseStatus,
} from './types';
import { computeKpis } from './kpis';

const snapshot: CalculationSnapshot = {
  profileId: 'profile-1',
  profileName: 'Banco de prueba',
  mode: 'bs',
  inputAmount: 1_000,
  amountBs: 1_000,
  bcvRate: 40,
  binanceRate: 46,
  interventionPct: 0.5,
  interventionFeeBs: 5,
  netForPurchaseBs: 995,
  cardCommissionPct: 2,
  cardCommissionBase: 'usd',
  cardCommissionUsd: 0.5,
  cardCommissionBs: 20,
  binanceDepositPct: 1,
  binanceDepositFixedUsd: 0,
  binanceDepositUsd: 0.25,
  interbankEnabled: false,
  interbankPct: 0.3,
  interbankBase: 'initial',
  interbankCostBs: 0,
  igtfEnabled: false,
  igtfPct: 3,
  igtfBase: 'card',
  igtfCostBs: 0,
  slippageEnabled: false,
  slippagePct: 2,
};

function createPurchase(
  id: string,
  status: PurchaseStatus,
  overrides: Partial<PurchaseRecord> = {},
): PurchaseRecord {
  return {
    id,
    createdAt: '2024-01-01T00:00:00.000Z',
    profileId: snapshot.profileId,
    profileName: snapshot.profileName,
    mode: 'bs',
    inputAmount: 1_000,
    amountBs: 1_000,
    bcvRate: 40,
    binanceRate: 46,
    snapshot,
    usdBought: 24.88,
    usdForBinance: 24.38,
    usdDeposited: 24.13,
    totalCostBs: 1_000,
    estimatedBsOut: 1_110,
    estimatedProfitBs: 100,
    estimatedRoiPct: 10,
    breakEvenRate: 1_000 / 24.13,
    status,
    statusHistory: [],
    execution: null,
    notes: '',
    ...overrides,
  };
}

describe('computeKpis', () => {
  it('separates capital in transit and completed profit, excluding cancelled records', () => {
    const execution: PurchaseExecution = {
      realBinanceRate: 48,
      executedBsOut: 5_250,
      executedProfitBs: 250,
      executedRoiPct: 5,
      closedAt: '2024-01-02T00:00:00.000Z',
    };
    const purchases = [
      createPurchase('pending', 'pending', { totalCostBs: 1_000 }),
      createPurchase('credited', 'usd_credited', { totalCostBs: 1_500 }),
      createPurchase('deposited', 'deposited_binance', { totalCostBs: 2_000 }),
      createPurchase('completed-executed', 'completed', {
        totalCostBs: 5_000,
        estimatedProfitBs: 999,
        execution,
      }),
      createPurchase('completed-estimated', 'completed', {
        totalCostBs: 2_500,
        estimatedProfitBs: -100,
      }),
      createPurchase('cancelled', 'cancelled', {
        totalCostBs: 7_000,
        estimatedProfitBs: 6_000,
      }),
    ];

    expect(computeKpis(purchases)).toEqual({
      inTransitCapitalBs: 4_500,
      inTransitCount: 3,
      completedProfitBs: 150,
      completedCostBs: 7_500,
      weightedRoiPct: 2,
      completedCount: 2,
      cancelledCount: 1,
    });
  });

  it('returns zeroed KPIs for an empty list', () => {
    expect(computeKpis([])).toEqual({
      inTransitCapitalBs: 0,
      inTransitCount: 0,
      completedProfitBs: 0,
      completedCostBs: 0,
      weightedRoiPct: 0,
      completedCount: 0,
      cancelledCount: 0,
    });
  });

  it('rounds summed monetary totals once while retaining a full-precision weighted ROI', () => {
    const purchases = [
      createPurchase('one', 'pending', { totalCostBs: 0.1 }),
      createPurchase('two', 'pending', { totalCostBs: 0.2 }),
      createPurchase('closed-one', 'completed', {
        totalCostBs: 0.1,
        estimatedProfitBs: 0.01,
      }),
      createPurchase('closed-two', 'completed', {
        totalCostBs: 0.2,
        estimatedProfitBs: 0.02,
      }),
    ];
    const result = computeKpis(purchases);

    expect(result.inTransitCapitalBs).toBe(0.3);
    expect(result.completedProfitBs).toBe(0.03);
    expect(result.completedCostBs).toBe(0.3);
    expect(result.weightedRoiPct).toBeCloseTo(10, 12);
  });
});
