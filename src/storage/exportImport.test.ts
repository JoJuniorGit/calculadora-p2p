import { describe, expect, it } from 'vitest';
import { calculate } from '../domain/calculations';
import { calculateExecution } from '../domain/purchases';
import type {
  BankProfile,
  CalculationInput,
  PersistedState,
  PurchaseRecord,
  SaleRecord,
  StatusChange,
} from '../domain/types';
import {
  createConfigJsonExport,
  createPurchasesCsvExport,
  createPurchasesJsonExport,
  parseConfigJson,
  parsePurchasesCsv,
  parsePurchasesJson,
} from './exportImport';

const timestamp = '2024-01-02T03:04:05.000Z';

function createProfile(): BankProfile {
  return {
    id: 'profile-1',
    name: 'Banco de prueba',
    cardCommissionPct: 2,
    cardCommissionBase: 'usd',
    binanceDepositPct: 1,
    binanceDepositFixedUsd: 0.5,
    interbankEnabled: false,
    interbankPct: 0.3,
    interbankBase: 'initial',
    igtfEnabled: false,
    igtfPct: 3,
    igtfBase: 'card',
    slippageEnabled: false,
    slippagePct: 2,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createInput(profile = createProfile()): CalculationInput {
  return {
    mode: 'bs',
    amount: 10_000,
    bcvRate: 40,
    binanceRate: 46,
    profile,
    options: {
      interbankEnabled: false,
      igtfEnabled: false,
      slippageEnabled: false,
    },
  };
}

function createPurchase(
  id = 'purchase-1',
  overrides: Partial<PurchaseRecord> = {},
): PurchaseRecord {
  const input = createInput();
  const result = calculate(input);

  return {
    id,
    createdAt: timestamp,
    profileId: input.profile.id,
    profileName: input.profile.name,
    mode: result.mode,
    inputAmount: result.inputAmount,
    amountBs: result.amountBs,
    bcvRate: input.bcvRate,
    binanceRate: input.binanceRate,
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
    statusHistory: [
      {
        id: 'history-1',
        timestamp,
        fromStatus: null,
        toStatus: 'pending',
        note: 'Compra registrada',
      },
    ],
    execution: null,
    notes: '',
    ...overrides,
  };
}

function createCompletedPurchase(): PurchaseRecord {
  const purchase = createPurchase();
  const statusHistory: StatusChange[] = [
    {
      id: 'history-1',
      timestamp: '2024-01-02T01:00:00.000Z',
      fromStatus: null,
      toStatus: 'pending',
      note: 'Compra registrada',
    },
    {
      id: 'history-2',
      timestamp: '2024-01-02T01:15:00.000Z',
      fromStatus: 'pending',
      toStatus: 'usd_credited',
      note: 'Divisas acreditadas',
    },
    {
      id: 'history-3',
      timestamp: '2024-01-02T01:30:00.000Z',
      fromStatus: 'usd_credited',
      toStatus: 'deposited_binance',
      note: 'Depósito realizado',
    },
    {
      id: 'history-4',
      timestamp: '2024-01-02T01:45:00.000Z',
      fromStatus: 'deposited_binance',
      toStatus: 'completed',
      note: 'Venta completada',
    },
  ];
  const execution = calculateExecution(purchase, 46.5);

  return {
    ...purchase,
    status: 'completed',
    statusHistory,
    execution: { ...execution, closedAt: statusHistory[3].timestamp },
    notes: 'Operación, revisada\nsegunda línea',
  };
}

function createSale(id: string, purchaseId: string): SaleRecord {
  return {
    id,
    createdAt: '2024-01-03T10:00:00.000Z',
    notes: 'Venta parcial, "primera"\ny segunda línea',
    totalUsdtSold: 100,
    p2pFixedFeeUsdt: 0.06,
    netUsdtLiquidated: 99.94,
    sellRateVes: 1_000,
    totalVesReceived: 99_940,
    totalAllocatedCostVes: 4_000,
    totalRealizedProfitVes: 95_940,
    realizedRoiPercent: 2_398.5,
    walletBalanceAfterUsdt: 150,
    allocations: [
      {
        allocationId: `${id}:${purchaseId}`,
        saleId: id,
        purchaseId,
        allocatedAt: '2024-01-03T10:00:00.000Z',
        usdtTaken: 100,
        p2pFeeShareUsdt: 0.06,
        netUsdtSold: 99.94,
        sellRateVes: 1_000,
        allocatedCostVes: 4_000,
        allocatedRevenueVes: 99_940,
        allocatedProfitVes: 95_940,
        allocatedRoiPercent: 2_398.5,
        lotRemainingUsdtAfter: 150,
      },
    ],
  };
}

function createPersistedState(): PersistedState {
  const profile = createProfile();

  return {
    schemaVersion: 1,
    rates: {
      bcv: { value: 40, updatedAt: timestamp, source: 'manual' },
      binance: { value: 46, updatedAt: timestamp, source: 'auto' },
    },
    profiles: [profile],
    purchases: [createPurchase()],
    sales: [],
    disclaimer: { text: 'Aviso de simulación para pruebas.', hasSeen: true },
    theme: 'light',
  };
}

describe('purchase JSON exports', () => {
  it('round-trips the JSON wrapper', () => {
    const purchase = createPurchase();

    expect(parsePurchasesJson(createPurchasesJsonExport([purchase]))).toEqual({
      ok: true,
      data: { purchases: [purchase], sales: [] },
    });
  });

  it('round-trips sales alongside their purchases', () => {
    const purchase = createPurchase();
    const sale = createSale('sale-1', purchase.id);

    expect(parsePurchasesJson(createPurchasesJsonExport([purchase], [sale]))).toEqual({
      ok: true,
      data: { purchases: [purchase], sales: [sale] },
    });
  });

  it('accepts a bare purchase array', () => {
    const purchase = createPurchase();

    expect(parsePurchasesJson(JSON.stringify([purchase]))).toEqual({
      ok: true,
      data: { purchases: [purchase], sales: [] },
    });
  });

  it('rejects malformed JSON, missing schema versions, and invalid records', () => {
    const malformed = parsePurchasesJson('{invalid');
    const missingVersion = parsePurchasesJson(
      JSON.stringify({ exportedAt: timestamp, purchases: [createPurchase()] }),
    );
    const invalidRecord = parsePurchasesJson(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: timestamp,
        purchases: [{ ...createPurchase(), id: '' }],
      }),
    );
    const invalidSale = parsePurchasesJson(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: timestamp,
        purchases: [createPurchase()],
        sales: [{ ...createSale('sale-1', 'purchase-1'), totalUsdtSold: 0 }],
      }),
    );

    expect(malformed.ok).toBe(false);
    expect(missingVersion.ok).toBe(false);
    expect(invalidRecord.ok).toBe(false);
    if (!invalidRecord.ok) expect(invalidRecord.errors.join(' ')).toContain('Registro 1');
    expect(invalidSale.ok).toBe(false);
    if (!invalidSale.ok) expect(invalidSale.errors.join(' ')).toContain('Venta 1');
  });
});

describe('purchase CSV exports', () => {
  it('round-trips quoted notes, completed execution, and multi-entry history', () => {
    const purchase = createCompletedPurchase();
    const csv = createPurchasesCsvExport([purchase]);

    expect(csv.startsWith('# schemaVersion=1\r\n')).toBe(true);
    expect(parsePurchasesCsv(csv)).toEqual({
      ok: true,
      data: { purchases: [purchase], sales: [] },
    });
  });

  it('round-trips historical purchase date and rate source', () => {
    const purchase = createPurchase('purchase-historical', {
      purchaseDate: '2026-11-10',
      rateReference: {
        source: 'historical',
        bcvAsOf: '2026-11-10T00:00:00.000Z',
        bcvForwardFilled: false,
        binanceAsOf: '2026-11-10T16:00:00.000Z',
        binanceMethod: 'median',
      },
    });
    const csv = createPurchasesCsvExport([purchase]);

    expect(parsePurchasesCsv(csv)).toEqual({
      ok: true,
      data: { purchases: [purchase], sales: [] },
    });
  });

  it('round-trips a sales section after the purchase rows', () => {
    const purchase = createPurchase();
    const sale = createSale('sale-1', purchase.id);
    const csv = createPurchasesCsvExport([purchase], [sale]);

    expect(csv).toContain(`\r\n# sales=1\r\n`);
    expect(parsePurchasesCsv(csv)).toEqual({
      ok: true,
      data: { purchases: [purchase], sales: [sale] },
    });
  });

  it('rejects a sales row with an invalid numeric cell and reports its row number', () => {
    const purchase = createPurchase();
    const sale = createSale('sale-1', purchase.id);
    const lines = createPurchasesCsvExport([purchase], [sale]).split('\r\n');
    const salesHeaderIndex = lines.indexOf('# sales=1');
    lines[salesHeaderIndex + 2] = lines[salesHeaderIndex + 2].replace(
      ',100,',
      ',not-a-number,',
    );

    const result = parsePurchasesCsv(lines.join('\r\n'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain(`Fila ${salesHeaderIndex + 3}`);
  });

  it('rejects a row with an invalid numeric cell and reports its row number', () => {
    const csv = createPurchasesCsvExport([createPurchase()]);
    const lines = csv.split('\r\n');
    lines[2] = lines[2].replace(',10000,', ',not-a-number,');

    const result = parsePurchasesCsv(lines.join('\r\n'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('Fila 3');
  });
});

describe('config JSON exports', () => {
  it('round-trips a persisted config and rejects unsupported schema versions', () => {
    const config = createPersistedState();

    expect(parseConfigJson(createConfigJsonExport(config))).toEqual({ ok: true, data: config });

    const unsupported = parseConfigJson(
      JSON.stringify({ ...config, schemaVersion: 2, exportedAt: timestamp }),
    );
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.errors.join(' ')).toContain('versión');
  });
});
