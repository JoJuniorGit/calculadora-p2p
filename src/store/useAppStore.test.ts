/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { calculate, round2 } from '../domain/calculations';
import { computeKpis } from '../domain/kpis';
import type {
  BankProfile,
  CalculationInput,
  PersistedState,
  PurchaseRecord,
} from '../domain/types';
import { SCHEMA_VERSION, useAppStore } from './useAppStore';

const timestamp = '2024-01-02T03:04:05.000Z';
const defaultDisclaimer = {
  enabled: false,
  text: 'Esta herramienta es una simulación y no constituye asesoría financiera.',
};

function createProfile(overrides: Partial<BankProfile> = {}): BankProfile {
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
    ...overrides,
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

function createPurchase(id = 'purchase-1', overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
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
    statusHistory: [],
    execution: null,
    notes: '',
    ...overrides,
  };
}

function resetStore(): void {
  useAppStore.setState({
    schemaVersion: SCHEMA_VERSION,
    rates: {
      bcv: { value: 0, updatedAt: null, source: 'manual' },
      binance: { value: 0, updatedAt: null, source: 'manual' },
    },
    profiles: [],
    purchases: [],
    sales: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: defaultDisclaimer,
    theme: 'light',
  });
  localStorage.clear();
}

describe('useAppStore profile order', () => {
  beforeEach(resetStore);

  it('moves a profile by id without mutating the previous array', () => {
    const first = createProfile({ id: 'profile-1', name: 'Banco Uno' });
    const second = createProfile({ id: 'profile-2', name: 'Banco Dos' });
    const third = createProfile({ id: 'profile-3', name: 'Banco Tres' });
    useAppStore.setState({ profiles: [first, second, third] });
    const previous = useAppStore.getState().profiles;

    useAppStore.getState().moveProfile(third.id, first.id);

    expect(useAppStore.getState().profiles.map((profile) => profile.id)).toEqual([
      'profile-3',
      'profile-1',
      'profile-2',
    ]);
    expect(useAppStore.getState().profiles).not.toBe(previous);
    expect(previous.map((profile) => profile.id)).toEqual([
      'profile-1',
      'profile-2',
      'profile-3',
    ]);
  });

  it('ignores identical or unknown profile ids', () => {
    const first = createProfile({ id: 'profile-1', name: 'Banco Uno' });
    const second = createProfile({ id: 'profile-2', name: 'Banco Dos' });
    useAppStore.setState({ profiles: [first, second] });
    const previous = useAppStore.getState().profiles;

    useAppStore.getState().moveProfile(first.id, first.id);
    useAppStore.getState().moveProfile('missing-profile', second.id);
    useAppStore.getState().moveProfile(first.id, 'missing-profile');

    expect(useAppStore.getState().profiles).toBe(previous);
  });

  it('persists the reordered profile ids', () => {
    const first = createProfile({ id: 'profile-1', name: 'Banco Uno' });
    const second = createProfile({ id: 'profile-2', name: 'Banco Dos' });
    const third = createProfile({ id: 'profile-3', name: 'Banco Tres' });
    useAppStore.setState({ profiles: [first, second, third] });

    useAppStore.getState().moveProfile(third.id, first.id);

    const persisted = JSON.parse(
      localStorage.getItem('calculadora-p2p') ?? '{}',
    ) as { state?: { profiles?: Array<{ id: string }> } };
    expect(persisted.state?.profiles?.map((profile) => profile.id)).toEqual([
      'profile-3',
      'profile-1',
      'profile-2',
    ]);
  });
});

describe('useAppStore purchase actions', () => {
  beforeEach(resetStore);

  it('records a pending purchase with the calculation snapshot and initial history', () => {
    const input = createInput();
    const result = calculate(input);

    const record = useAppStore.getState().recordPurchase(input, 'Compra de prueba');

    expect(record).toMatchObject({
      profileId: input.profile.id,
      profileName: input.profile.name,
      status: 'pending',
      snapshot: result.snapshot,
      usdBought: result.usdBought,
      usdForBinance: result.usdForBinance,
      usdDeposited: result.usdDeposited,
      totalCostBs: result.totalCostBs,
      estimatedBsOut: result.bsOut,
      estimatedProfitBs: result.netProfitBs,
      estimatedRoiPct: result.roiPct,
      breakEvenRate: result.breakEvenRate,
      notes: 'Compra de prueba',
    });
    expect(record.statusHistory).toHaveLength(1);
    expect(record.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'pending',
      note: 'Compra registrada',
    });
    expect(useAppStore.getState().purchases).toEqual([record]);
  });

  it('persists the purchase date and rate reference from the registration metadata without changing live rates', () => {
    const input = createInput();
    const rateReference = {
      source: 'historical' as const,
      bcvAsOf: '2024-01-01T00:00:00.000Z',
      bcvForwardFilled: false,
      binanceAsOf: '2024-01-01T12:00:00.000Z',
      binanceMethod: 'median' as const,
    };
    useAppStore.getState().setRate('bcv', 50, 'manual');
    useAppStore.getState().setRate('binance', 60, 'auto');
    const liveRatesBefore = useAppStore.getState().rates;

    const record = useAppStore.getState().recordPurchase(input, 'Compra histórica', {
      purchaseDate: '2024-01-01',
      rateReference,
    });

    expect(record).toMatchObject({
      purchaseDate: '2024-01-01',
      rateReference,
      bcvRate: input.bcvRate,
      binanceRate: input.binanceRate,
      snapshot: {
        bcvRate: input.bcvRate,
        binanceRate: input.binanceRate,
      },
    });
    expect(useAppStore.getState().rates).toEqual(liveRatesBefore);
  });

  it('allows the next status and rejects a skipped transition', () => {
    const record = useAppStore.getState().recordPurchase(createInput());

    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'completed', '', 46.5),
    ).toThrow('El inventario se actualiza registrando ventas P2P');
    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited'),
    ).toThrow('Transición de estado no permitida');
    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'approved'),
    ).toThrow('Usa el registro de acreditación para aprobar la compra');

    useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'TOTAL',
      accreditedUsd: record.requestedUsd,
      keepInterbankSunk: true,
    });
    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited', '  Acreditado  ');

    expect(useAppStore.getState().purchases[0]).toMatchObject({ status: 'usd_credited' });
    expect(useAppStore.getState().purchases[0].statusHistory[2].note).toBe('Acreditado');
  });

  it('funds a lot in Binance and rejects manual inventory statuses', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'TOTAL',
      accreditedUsd: record.requestedUsd,
      keepInterbankSunk: true,
    });
    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited');
    useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');

    const funded = useAppStore.getState().purchases[0];
    expect(funded.status).toBe('deposited_binance');
    expect(funded.fundedToBinanceAt).toBeTruthy();
    expect(funded.initialBinanceUsdt).toBe(funded.usdDeposited);
    expect(funded.remainingBinanceUsdt).toBe(funded.usdDeposited);
    expect(funded.remainingCostVes).toBe(funded.executedInvestmentVes);
    expect(funded.unitCostInBinanceVes).toBe(
      round2(funded.executedInvestmentVes / funded.usdDeposited),
    );
    expect(funded.allocations).toEqual([]);

    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'completed'),
    ).toThrow('El inventario se actualiza registrando ventas P2P');
    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'partial'),
    ).toThrow('El inventario se actualiza registrando ventas P2P');
  });

  it('accredits a pending purchase partially while preserving the original request', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    const half = round2(record.requestedUsd / 2);
    const updated = useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'PARTIAL',
      accreditedUsd: half,
      keepInterbankSunk: false,
      note: 'Corte de mesa de cambio',
    });

    expect(updated.status).toBe('approved');
    expect(updated.requestedInvestmentVes).toBe(record.requestedInvestmentVes);
    expect(updated.requestedUsd).toBe(record.requestedUsd);
    expect(updated.accreditationType).toBe('PARTIAL');
    expect(updated.accreditedUsd).toBe(half);
    expect(updated.executedInvestmentVes).toBe(updated.amountBs);
    expect(updated.amountBs).toBeLessThan(record.amountBs);
    expect(updated.refundedVes).toBe(
      round2(record.requestedInvestmentVes - updated.amountBs),
    );
    expect(updated.accreditationConfirmedAt).toBeTruthy();
    expect(updated.statusHistory[1].note).toContain('Acreditación parcial');
    expect(updated.statusHistory[1].note).toContain('Corte de mesa de cambio');
    expect(updated.statusHistory[1].metadata).toMatchObject({
      accreditationType: 'PARTIAL',
      keepInterbankSunk: false,
      accreditedUsd: half,
    });
    expect(computeKpis(useAppStore.getState().purchases).capitalInTransitVes).toBe(
      updated.totalCostBs,
    );
    expect(computeKpis(useAppStore.getState().purchases).capitalInBankVes).toBe(0);
  });

  it('keeps the original values when the accreditation is total', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    const updated = useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'TOTAL',
      accreditedUsd: record.requestedUsd,
      keepInterbankSunk: true,
    });

    expect(updated.amountBs).toBe(record.amountBs);
    expect(updated.usdDeposited).toBe(record.usdDeposited);
    expect(updated.totalCostBs).toBe(record.totalCostBs);
    expect(updated.refundedVes).toBe(0);
    expect(updated.accreditationRatePercent).toBe(100);
    expect(updated.accreditationConfirmedAt).toBeTruthy();
    expect(updated.statusHistory[1].note).toContain('Acreditación total');
  });

  it('rejects invalid or repeated accreditation requests', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    const request = {
      accreditationType: 'PARTIAL' as const,
      accreditedUsd: round2(record.requestedUsd / 2),
      keepInterbankSunk: false,
    };

    expect(() =>
      useAppStore.getState().accreditPurchase(record.id, {
        ...request,
        accreditedUsd: 0,
      }),
    ).toThrow('Los USD acreditados deben ser mayores que 0');
    expect(() =>
      useAppStore.getState().accreditPurchase(record.id, {
        ...request,
        accreditedUsd: record.requestedUsd + 1,
      }),
    ).toThrow('Los USD acreditados no pueden superar los USD solicitados');

    useAppStore.getState().accreditPurchase(record.id, request);
    expect(() => useAppStore.getState().accreditPurchase(record.id, request)).toThrow(
      'Solo las compras pendientes pueden registrar una acreditación',
    );
  });

  it('rejects an unknown purchase and any manual inventory completion', () => {
    expect(() =>
      useAppStore.getState().changePurchaseStatus('missing', 'usd_credited'),
    ).toThrow('Compra no encontrada');

    const record = useAppStore.getState().recordPurchase(createInput());
    useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'TOTAL',
      accreditedUsd: record.requestedUsd,
      keepInterbankSunk: true,
    });
    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited');
    useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');

    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'completed'),
    ).toThrow('El inventario se actualiza registrando ventas P2P');
    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'partial'),
    ).toThrow('El inventario se actualiza registrando ventas P2P');
  });

  it('registers a FIFO sale, blocks deleting consumed purchases, and restores lots on sale deletion', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'TOTAL',
      accreditedUsd: record.requestedUsd,
      keepInterbankSunk: true,
    });
    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited');
    useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');

    const funded = useAppStore.getState().purchases[0];
    const sale = useAppStore.getState().registerSale({
      totalUsdtSold: 100,
      sellRateVes: 1_080,
    });
    const afterSale = useAppStore.getState().purchases[0];

    expect(sale.totalUsdtSold).toBe(100);
    expect(sale.p2pFixedFeeUsdt).toBe(0.06);
    expect(sale.totalVesReceived).toBeCloseTo(107_935.2, 2);
    expect(sale.allocations).toHaveLength(1);
    expect(sale.allocations[0].purchaseId).toBe(record.id);
    expect(afterSale.status).toBe('partial');
    expect(afterSale.remainingBinanceUsdt).toBe(
      round2((funded.remainingBinanceUsdt ?? 0) - 100),
    );
    expect(afterSale.soldUsdt).toBe(100);

    expect(() => useAppStore.getState().deletePurchase(record.id)).toThrow(
      'No se puede eliminar una compra consumida por ventas',
    );

    useAppStore.getState().deleteSale(sale.id);
    const restored = useAppStore.getState().purchases[0];
    expect(restored.status).toBe('deposited_binance');
    expect(restored.remainingBinanceUsdt).toBe(funded.initialBinanceUsdt);
    expect(restored.remainingCostVes).toBe(funded.executedTotalCostVes);
    expect(restored.allocations).toEqual([]);
    expect(useAppStore.getState().sales).toEqual([]);

    useAppStore.getState().deletePurchase(record.id);
    expect(useAppStore.getState().purchases).toEqual([]);
  });

  it('rejects a sale larger than the funded Binance inventory', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    useAppStore.getState().accreditPurchase(record.id, {
      accreditationType: 'TOTAL',
      accreditedUsd: record.requestedUsd,
      keepInterbankSunk: true,
    });
    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited');
    useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');

    expect(() =>
      useAppStore.getState().registerSale({
        totalUsdtSold: record.usdDeposited + 1,
        sellRateVes: 1_080,
      }),
    ).toThrow(/Saldo insuficiente/);
    expect(useAppStore.getState().sales).toEqual([]);
  });
});

describe('useAppStore imports', () => {
  beforeEach(resetStore);

  it('upserts imported purchases by id without changing their order', () => {
    const first = createPurchase('first');
    const second = createPurchase('second');
    const updatedFirst = { ...first, notes: 'Actualizada' };
    const third = createPurchase('third');

    useAppStore.setState({ purchases: [first, second] });
    const importedCount = useAppStore.getState().importPurchases([updatedFirst, third]);

    expect(importedCount).toBe(2);
    expect(useAppStore.getState().purchases.map((purchase) => purchase.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(useAppStore.getState().purchases[0].notes).toBe('Actualizada');
  });

  it('replaces persisted config slices and resets filters', () => {
    const profile = createProfile({ id: 'imported-profile' });
    const purchase = createPurchase('imported-purchase');
    const config: PersistedState = {
      schemaVersion: 1,
      rates: {
        bcv: { value: 55, updatedAt: timestamp, source: 'manual' },
        binance: { value: 60, updatedAt: timestamp, source: 'auto' },
      },
      profiles: [profile],
      purchases: [purchase],
      sales: [],
      disclaimer: { enabled: true, text: 'Aviso importado para pruebas.' },
      theme: 'dark',
    };

    useAppStore.setState({ filters: { status: 'completed', profileName: 'Antiguo', dateFrom: 'x', dateTo: 'y' } });
    useAppStore.getState().importConfig(config);

    expect(useAppStore.getState()).toMatchObject({
      schemaVersion: 1,
      rates: config.rates,
      profiles: config.profiles,
      purchases: config.purchases,
      sales: config.sales,
      disclaimer: config.disclaimer,
      theme: 'dark',
      filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    });
  });
});

describe('useAppStore persistence', () => {
  beforeEach(resetStore);

  it('migrates a version-zero persisted slice without schemaVersion', async () => {
    const legacyState = {
      rates: {
        bcv: { value: 52, updatedAt: timestamp, source: 'manual' as const },
        binance: { value: 57, updatedAt: timestamp, source: 'auto' as const },
      },
      profiles: [],
      purchases: [],
      disclaimer: defaultDisclaimer,
      theme: 'dark' as const,
    };
    localStorage.setItem(
      'calculadora-p2p',
      JSON.stringify({ state: legacyState, version: 0 }),
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().schemaVersion).toBe(1);
    expect(useAppStore.getState().rates).toEqual(legacyState.rates);
    expect(useAppStore.getState().theme).toBe('dark');
  });
});
