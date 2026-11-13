import { describe, expect, it } from 'vitest';
import { reconcileFifoInventory, round2 } from './calculations';
import type { PurchaseRecord, SaleRecord } from './types';

function lot(
  id: string,
  initialUsdt: number,
  costVes: number,
  fundedAt: string,
  overrides: Partial<PurchaseRecord> = {},
): PurchaseRecord {
  return {
    id,
    createdAt: fundedAt,
    profileId: 'profile-1',
    profileName: `Lote ${id}`,
    mode: 'bs',
    inputAmount: costVes,
    amountBs: costVes,
    bcvRate: 1,
    binanceRate: 1,
    snapshot: {} as PurchaseRecord['snapshot'],
    usdBought: initialUsdt,
    usdForBinance: initialUsdt,
    usdDeposited: initialUsdt,
    totalCostBs: costVes,
    estimatedBsOut: costVes,
    estimatedProfitBs: 0,
    estimatedRoiPct: 0,
    breakEvenRate: round2(costVes / initialUsdt),
    requestedInvestmentVes: costVes,
    requestedUsd: initialUsdt,
    requestedTotalCostVes: costVes,
    executedTotalCostVes: costVes,
    fundedToBinanceAt: fundedAt,
    initialBinanceUsdt: initialUsdt,
    unitCostInBinanceVes: round2(costVes / initialUsdt),
    soldUsdt: 0,
    remainingBinanceUsdt: initialUsdt,
    allocatedCostVesTotal: 0,
    remainingCostVes: costVes,
    realizedRevenueVes: 0,
    realizedProfitVes: 0,
    weightedAverageSellRateVes: 0,
    allocations: [],
    accreditationType: 'TOTAL',
    accreditedUsd: initialUsdt,
    accreditationRatePercent: 100,
    executedInvestmentVes: costVes,
    refundedVes: 0,
    accreditationConfirmedAt: fundedAt,
    status: 'deposited_binance',
    statusHistory: [],
    execution: null,
    notes: '',
    ...overrides,
  };
}

function sale(
  id: string,
  totalUsdtSold: number,
  sellRateVes: number,
  createdAt: string,
  p2pFixedFeeUsdt = 0.06,
): SaleRecord {
  return {
    id,
    createdAt,
    notes: '',
    totalUsdtSold,
    p2pFixedFeeUsdt,
    netUsdtLiquidated: 0,
    sellRateVes,
    totalVesReceived: 0,
    totalAllocatedCostVes: 0,
    totalRealizedProfitVes: 0,
    realizedRoiPercent: 0,
    walletBalanceAfterUsdt: 0,
    allocations: [],
  };
}

const lots = [
  lot('lot-1', 200, 193_000, '2024-01-01T00:00:00.000Z'),
  lot('lot-2', 180, 175_500, '2024-01-02T00:00:00.000Z'),
  lot('lot-3', 250, 246_250, '2024-01-03T00:00:00.000Z'),
];

describe('reconcileFifoInventory', () => {
  it('liquidates the numeric example across three FIFO lots', () => {
    const result = reconcileFifoInventory(lots, [
      sale('sale-1', 500, 1_080, '2024-01-04T00:00:00.000Z'),
    ]);
    const closed = result.sales[0];

    expect(closed.totalVesReceived).toBeCloseTo(539_935.2, 2);
    expect(closed.totalAllocatedCostVes).toBe(486_700);
    expect(closed.totalRealizedProfitVes).toBeCloseTo(53_235.2, 2);
    expect(closed.realizedRoiPercent).toBeCloseTo(10.94, 2);
    expect(closed.netUsdtLiquidated).toBe(499.94);
    expect(closed.walletBalanceAfterUsdt).toBe(130);
    expect(closed.allocations).toHaveLength(3);

    const thirdLot = result.purchases.find((purchase) => purchase.id === 'lot-3');
    expect(thirdLot?.status).toBe('partial');
    expect(thirdLot?.remainingBinanceUsdt).toBe(130);
    expect(thirdLot?.remainingCostVes).toBe(128_050);
    expect(thirdLot?.realizedProfitVes).toBe(11_384.45);
    expect(closed.allocations[2]?.allocatedProfitVes).toBe(11_384.45);
    expect(closed.allocations[2]?.lotRemainingUsdtAfter).toBe(130);

    expect(
      result.purchases.find((purchase) => purchase.id === 'lot-1')?.status,
    ).toBe('completed');
    expect(
      result.purchases.find((purchase) => purchase.id === 'lot-2')?.status,
    ).toBe('completed');
  });

  it('prorates the fixed fee and the revenue without losing cents', () => {
    const result = reconcileFifoInventory(lots, [
      sale('sale-1', 500, 1_080, '2024-01-04T00:00:00.000Z'),
    ]);
    const closed = result.sales[0];

    const feeShares = closed.allocations.reduce(
      (total, allocation) => total + allocation.p2pFeeShareUsdt,
      0,
    );
    const revenueShares = closed.allocations.reduce(
      (total, allocation) => total + allocation.allocatedRevenueVes,
      0,
    );
    expect(round2(feeShares)).toBe(0.06);
    expect(round2(revenueShares)).toBeCloseTo(539_935.2, 2);
  });

  it('orders eligible lots by funding timestamp, then creation, then id', () => {
    const shuffled = [lots[2], lots[0], lots[1]];
    const result = reconcileFifoInventory(shuffled, [
      sale('sale-1', 200, 1_080, '2024-01-04T00:00:00.000Z'),
    ]);

    expect(result.sales[0].allocations[0]?.purchaseId).toBe('lot-1');
    expect(
      result.purchases.find((purchase) => purchase.id === 'lot-1')?.remainingBinanceUsdt,
    ).toBe(0);
    expect(
      result.purchases.find((purchase) => purchase.id === 'lot-2')?.remainingBinanceUsdt,
    ).toBe(180);
  });

  it('restores lot balances when a sale is removed', () => {
    const withSale = reconcileFifoInventory(lots, [
      sale('sale-1', 500, 1_080, '2024-01-04T00:00:00.000Z'),
    ]);
    const restored = reconcileFifoInventory(withSale.purchases, []);

    for (const original of lots) {
      const current = restored.purchases.find((purchase) => purchase.id === original.id);
      expect(current?.status).toBe('deposited_binance');
      expect(current?.remainingBinanceUsdt).toBe(original.initialBinanceUsdt);
      expect(current?.remainingCostVes).toBe(original.executedTotalCostVes);
      expect(current?.allocations).toEqual([]);
    }
  });

  it('rejects a sale larger than the available Binance balance', () => {
    expect(() =>
      reconcileFifoInventory(lots, [
        sale('sale-1', 700, 1_080, '2024-01-04T00:00:00.000Z'),
      ]),
    ).toThrow(/Saldo insuficiente/);
  });

  it('rejects a fixed fee that consumes the whole sale', () => {
    expect(() =>
      reconcileFifoInventory(lots, [
        sale('sale-1', 10, 1_080, '2024-01-04T00:00:00.000Z', 10),
      ]),
    ).toThrow(/comisión fija P2P/i);
  });

  it('replays sales in chronological order', () => {
    const result = reconcileFifoInventory(lots, [
      sale('sale-2', 100, 1_100, '2024-01-05T00:00:00.000Z'),
      sale('sale-1', 200, 1_080, '2024-01-04T00:00:00.000Z'),
    ]);

    expect(result.sales.map((record) => record.id)).toEqual(['sale-1', 'sale-2']);
    expect(
      result.purchases.find((purchase) => purchase.id === 'lot-1')?.soldUsdt,
    ).toBe(200);
    expect(
      result.purchases.find((purchase) => purchase.id === 'lot-2')?.soldUsdt,
    ).toBe(100);
  });
});
