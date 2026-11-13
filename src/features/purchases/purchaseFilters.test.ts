import { describe, expect, it } from 'vitest';
import type { PurchaseRecord } from '../../domain/types';
import { filterPurchases } from './purchaseFilters';

function createPurchase(
  id: string,
  createdAt: string,
  purchaseDate?: string,
): PurchaseRecord {
  return {
    id,
    createdAt,
    profileId: 'profile-1',
    profileName: 'Banco Test',
    mode: 'bs',
    inputAmount: 1,
    amountBs: 1,
    bcvRate: 1,
    binanceRate: 1,
    snapshot: {} as PurchaseRecord['snapshot'],
    usdBought: 1,
    usdForBinance: 1,
    usdDeposited: 1,
    totalCostBs: 1,
    estimatedBsOut: 1,
    estimatedProfitBs: 0,
    estimatedRoiPct: 0,
    breakEvenRate: 1,
    requestedInvestmentVes: 1,
    requestedUsd: 1,
    accreditationType: 'TOTAL',
    accreditedUsd: 1,
    accreditationRatePercent: 100,
    executedInvestmentVes: 1,
    refundedVes: 0,
    accreditationConfirmedAt: null,
    status: 'pending',
    statusHistory: [],
    execution: null,
    notes: '',
    ...(purchaseDate ? { purchaseDate } : {}),
  };
}

const baseFilters = {
  status: 'all' as const,
  profileName: 'all',
  dateFrom: '',
  dateTo: '',
};

describe('filterPurchases date filtering', () => {
  it('prefers purchaseDate over the registration timestamp', () => {
    const purchase = createPurchase(
      'historical',
      new Date(2024, 0, 10, 12).toISOString(),
      '2024-01-02',
    );

    expect(
      filterPurchases([purchase], {
        ...baseFilters,
        dateFrom: '2024-01-02',
        dateTo: '2024-01-02',
      }),
    ).toEqual([purchase]);
    expect(
      filterPurchases([purchase], {
        ...baseFilters,
        dateFrom: '2024-01-10',
        dateTo: '2024-01-10',
      }),
    ).toEqual([]);
  });

  it('uses createdAt as the local-calendar fallback for legacy purchases', () => {
    const legacyPurchase = createPurchase(
      'legacy',
      new Date(2024, 0, 3, 12).toISOString(),
    );

    expect(
      filterPurchases([legacyPurchase], {
        ...baseFilters,
        dateFrom: '2024-01-03',
        dateTo: '2024-01-03',
      }),
    ).toEqual([legacyPurchase]);
  });
});
