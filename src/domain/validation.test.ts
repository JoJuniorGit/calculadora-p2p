import { describe, expect, it } from 'vitest';
import type { BankProfile, CalculationSnapshot, PersistedState, PurchaseRecord } from './types';
import {
  bankProfileDraftSchema,
  bankProfileSchema,
  configExportSchema,
  formatZodIssues,
  persistedStateSchema,
  purchaseRecordSchema,
  purchasesExportSchema,
  withLegacyAccreditationDefaults,
} from './validation';

const profile: BankProfile = {
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
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const snapshot: CalculationSnapshot = {
  profileId: profile.id,
  profileName: profile.name,
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
};

const purchase: PurchaseRecord = {
  id: 'purchase-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  profileId: profile.id,
  profileName: profile.name,
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
};

const persistedState: PersistedState = {
  schemaVersion: 1,
  rates: {
    bcv: { value: 40, source: 'manual', updatedAt: '2024-01-01T00:00:00.000Z' },
    binance: { value: 46, source: 'auto', updatedAt: null },
  },
  profiles: [profile],
  purchases: [purchase],
  disclaimer: { enabled: false, text: '' },
  theme: 'light',
};

describe('bank profile schemas', () => {
  it('accepts a valid profile and profile draft', () => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = profile;

    expect(bankProfileSchema.safeParse(profile).success).toBe(true);
    expect(bankProfileDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects an empty trimmed name, percentages above 100, and negative fixed fees', () => {
    expect(bankProfileSchema.safeParse({ ...profile, name: '   ' }).success).toBe(false);
    expect(bankProfileSchema.safeParse({ ...profile, cardCommissionPct: 100.01 }).success).toBe(
      false,
    );
    expect(
      bankProfileSchema.safeParse({ ...profile, binanceDepositFixedUsd: -0.01 }).success,
    ).toBe(false);
  });

  it('tolerates unknown keys using Zod object defaults', () => {
    expect(bankProfileSchema.safeParse({ ...profile, extraField: 'ignored' }).success).toBe(true);
  });
});

describe('purchase and persisted-state schemas', () => {
  it('accepts valid purchase and persisted state fixtures', () => {
    expect(purchaseRecordSchema.safeParse(purchase).success).toBe(true);
    expect(persistedStateSchema.safeParse(persistedState).success).toBe(true);
  });

  it('rejects an invalid purchase status and missing persisted-state fields', () => {
    expect(
      purchaseRecordSchema.safeParse({ ...purchase, status: 'in-progress' }).success,
    ).toBe(false);
    expect(
      persistedStateSchema.safeParse({
        schemaVersion: 1,
        rates: persistedState.rates,
        profiles: [],
        purchases: [],
      }).success,
    ).toBe(false);
  });

  it('rejects partial accreditation amounts at or below zero and above the request', () => {
    const partial: PurchaseRecord = {
      ...purchase,
      accreditationType: 'PARTIAL',
      accreditedUsd: 124.38,
      accreditationRatePercent: 50,
      executedInvestmentVes: 5_000,
      refundedVes: 5_000,
      accreditationConfirmedAt: '2024-01-02T00:00:00.000Z',
    };

    expect(purchaseRecordSchema.safeParse(partial).success).toBe(true);
    expect(
      purchaseRecordSchema.safeParse({ ...partial, accreditedUsd: 0 }).success,
    ).toBe(false);
    expect(
      purchaseRecordSchema.safeParse({ ...partial, accreditedUsd: -1 }).success,
    ).toBe(false);
    expect(
      purchaseRecordSchema.safeParse({
        ...partial,
        accreditedUsd: purchase.requestedUsd + 0.01,
      }).success,
    ).toBe(false);
  });

  it('normalizes legacy purchases without accreditation fields', () => {
    const legacy = { ...purchase } as Record<string, unknown>;
    for (const field of [
      'requestedInvestmentVes',
      'requestedUsd',
      'accreditationType',
      'accreditedUsd',
      'accreditationRatePercent',
      'executedInvestmentVes',
      'refundedVes',
      'accreditationConfirmedAt',
    ]) {
      delete legacy[field];
    }

    const normalized = withLegacyAccreditationDefaults(legacy) as PurchaseRecord;

    expect(normalized.requestedInvestmentVes).toBe(purchase.amountBs);
    expect(normalized.requestedUsd).toBe(purchase.usdBought);
    expect(normalized.accreditationType).toBe('TOTAL');
    expect(normalized.accreditationRatePercent).toBe(100);
    expect(normalized.refundedVes).toBe(0);
    expect(normalized.accreditationConfirmedAt).toBeNull();
    expect(purchaseRecordSchema.safeParse(normalized).success).toBe(true);
  });

  it('validates both export payload formats', () => {
    expect(
      purchasesExportSchema.safeParse({
        schemaVersion: 1,
        exportedAt: '2024-01-01T00:00:00.000Z',
        purchases: [purchase],
      }).success,
    ).toBe(true);
    expect(
      configExportSchema.safeParse({
        ...persistedState,
        exportedAt: '2024-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('formats Zod validation issues into non-empty Spanish path messages', () => {
    const invalidProfile = bankProfileSchema.safeParse({ ...profile, name: '' });

    expect(invalidProfile.success).toBe(false);
    if (invalidProfile.success) return;

    const messages = formatZodIssues(invalidProfile.error);

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain('name:');
    expect(messages[0]).toContain('El nombre del banco es obligatorio');
  });
});
