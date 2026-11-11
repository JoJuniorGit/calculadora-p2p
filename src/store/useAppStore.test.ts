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
import { formatRate } from '../utils/format';
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
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: defaultDisclaimer,
    theme: 'light',
  });
  localStorage.clear();
}

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

  it('allows the next status and rejects a skipped transition', () => {
    const record = useAppStore.getState().recordPurchase(createInput());

    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'completed', '', 46.5),
    ).toThrow('Transición de estado no permitida');

    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited', '  Acreditado  ');

    expect(useAppStore.getState().purchases[0]).toMatchObject({ status: 'usd_credited' });
    expect(useAppStore.getState().purchases[0].statusHistory[1].note).toBe('Acreditado');
  });

  it('stores execution and a formatted default note when a deposited purchase is completed', () => {
    const record = useAppStore.getState().recordPurchase(createInput());
    const store = useAppStore.getState();
    store.changePurchaseStatus(record.id, 'usd_credited');
    useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');
    useAppStore.getState().changePurchaseStatus(record.id, 'completed', '   ', 46.5);

    const completed = useAppStore.getState().purchases[0];

    expect(completed.status).toBe('completed');
    expect(completed.execution).toMatchObject({ realBinanceRate: 46.5 });
    expect(completed.execution?.closedAt).toBeTruthy();
    expect(completed.statusHistory).toHaveLength(4);
    expect(completed.statusHistory[3]).toMatchObject({
      fromStatus: 'deposited_binance',
      toStatus: 'completed',
      note: `Venta real a ${formatRate(46.5)} Bs.S/USD`,
    });
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

    expect(updated.status).toBe('usd_credited');
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
    expect(computeKpis(useAppStore.getState().purchases).inTransitCapitalBs).toBe(
      updated.totalCostBs,
    );
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

  it('rejects an unknown purchase and completion without a valid sale rate', () => {
    expect(() =>
      useAppStore.getState().changePurchaseStatus('missing', 'usd_credited'),
    ).toThrow('Compra no encontrada');

    const record = useAppStore.getState().recordPurchase(createInput());
    useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited');
    useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');

    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'completed'),
    ).toThrow('La tasa real de venta es obligatoria');
    expect(() =>
      useAppStore.getState().changePurchaseStatus(record.id, 'completed', '', 0),
    ).toThrow('La tasa real de venta debe ser mayor que 0');
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
