import { describe, expect, it } from 'vitest';
import type { CalculationSnapshot, PurchaseRecord, PurchaseStatus } from './types';
import {
  calculateExecution,
  canTransition,
  getNextStatuses,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_ORDER,
} from './purchases';

const snapshot: CalculationSnapshot = {
  profileId: 'profile-1',
  profileName: 'Banco de prueba',
  mode: 'bs',
  inputAmount: 10_000,
  amountBs: 10_000,
  bcvRate: 40,
  binanceRate: 46,
  interventionPct: 0.5,
  interventionFeeBs: 50,
  netForPurchaseBs: 9_950,
  cardCommissionPct: 2,
  cardCommissionBase: 'usd',
  cardCommissionUsd: 4.88,
  cardCommissionBs: 195.2,
  binanceDepositPct: 1,
  binanceDepositFixedUsd: 0.5,
  binanceDepositUsd: 2.94,
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
  usdtNet: 240.43,
};

function createPurchase(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: 'purchase-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    profileId: snapshot.profileId,
    profileName: snapshot.profileName,
    mode: 'bs',
    inputAmount: 10_000,
    amountBs: 10_000,
    bcvRate: 40,
    binanceRate: 46,
    snapshot,
    usdBought: 248.75,
    usdForBinance: 243.87,
    usdDeposited: 240.93,
    totalCostBs: 10_000,
    estimatedBsOut: 11_082.78,
    estimatedProfitBs: 1_082.78,
    estimatedRoiPct: 10.8278,
    breakEvenRate: 10_000 / 240.93,
    requestedInvestmentVes: 10_000,
    requestedUsd: 248.75,
    accreditationType: 'TOTAL',
    accreditedUsd: 248.75,
    accreditationRatePercent: 100,
    executedInvestmentVes: 10_000,
    refundedVes: 0,
    accreditationConfirmedAt: null,
    status: 'pending',
    statusHistory: [],
    execution: null,
    notes: '',
    ...overrides,
  };
}

describe('purchase status machine', () => {
  it('exposes status order, Spanish labels, and sequential next statuses', () => {
    expect(PURCHASE_STATUS_ORDER).toEqual([
      'pending',
      'approved',
      'usd_credited',
      'deposited_binance',
      'partial',
      'completed',
      'cancelled',
    ] satisfies PurchaseStatus[]);
    expect(PURCHASE_STATUS_LABELS).toEqual({
      pending: 'En espera',
      approved: 'Aprobado',
      usd_credited: 'Acreditado',
      deposited_binance: 'En Binance',
      partial: 'Parcial',
      completed: 'Completo',
      cancelled: 'Cancelado',
    });
    expect(getNextStatuses('pending')).toEqual(['approved', 'cancelled']);
    expect(getNextStatuses('approved')).toEqual(['usd_credited', 'cancelled']);
    expect(getNextStatuses('usd_credited')).toEqual(['deposited_binance', 'cancelled']);
    expect(getNextStatuses('deposited_binance')).toEqual([]);
    expect(getNextStatuses('partial')).toEqual([]);
    expect(getNextStatuses('completed')).toEqual([]);
    expect(getNextStatuses('cancelled')).toEqual([]);
  });

  it('allows only sequential progress before inventory funding', () => {
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('approved', 'usd_credited')).toBe(true);
    expect(canTransition('usd_credited', 'deposited_binance')).toBe(true);
    expect(canTransition('pending', 'usd_credited')).toBe(false);
    expect(canTransition('pending', 'deposited_binance')).toBe(false);
    expect(canTransition('usd_credited', 'completed')).toBe(false);
    expect(canTransition('deposited_binance', 'completed')).toBe(false);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('approved', 'cancelled')).toBe(true);
    expect(canTransition('usd_credited', 'cancelled')).toBe(true);
    expect(canTransition('deposited_binance', 'cancelled')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });
});

describe('calculateExecution', () => {
  it('calculates actual proceeds, profit, and ROI above and below the estimate', () => {
    const purchase = createPurchase();
    const original = { ...purchase };
    const higher = calculateExecution(purchase, 48);
    const lower = calculateExecution(purchase, 44);

    expect(higher).toMatchObject({
      realBinanceRate: 48,
      executedBsOut: 11_540.64,
      executedProfitBs: 1_540.64,
    });
    expect(lower).toMatchObject({
      realBinanceRate: 44,
      executedBsOut: 10_578.92,
      executedProfitBs: 578.92,
    });
    expect(higher.executedRoiPct).toBeCloseTo(15.4064, 12);
    expect(lower.executedRoiPct).toBeCloseTo(5.7892, 12);
    expect(Date.parse(higher.closedAt)).not.toBeNaN();
    expect(purchase).toEqual(original);
  });

  it('rejects a non-positive or non-finite real sale rate', () => {
    const purchase = createPurchase();

    expect(() => calculateExecution(purchase, 0)).toThrow(
      'La tasa real de venta debe ser mayor que 0',
    );
    expect(() => calculateExecution(purchase, Number.POSITIVE_INFINITY)).toThrow(
      'La tasa real de venta debe ser mayor que 0',
    );
    expect(() => calculateExecution(purchase, Number.NaN)).toThrow(
      'La tasa real de venta debe ser mayor que 0',
    );
  });
});
