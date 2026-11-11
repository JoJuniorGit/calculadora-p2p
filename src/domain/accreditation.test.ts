import { describe, expect, it } from 'vitest';
import type {
  BankProfile,
  CalculationInput,
  CalculationResult,
  PurchaseRecord,
} from './types';
import { calculate, recalculateAccreditation, round2 } from './calculations';

const timestamp = '2024-01-01T00:00:00.000Z';

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

function createInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    mode: 'bs',
    amount: 10_000,
    bcvRate: 40,
    binanceRate: 46,
    profile: createProfile(),
    options: {
      interbankEnabled: false,
      igtfEnabled: false,
      slippageEnabled: false,
    },
    ...overrides,
  };
}

function createPurchaseFixture(input = createInput()): {
  purchase: PurchaseRecord;
  initial: CalculationResult;
} {
  const initial = calculate(input);

  return {
    initial,
    purchase: {
      id: 'purchase-1',
      createdAt: timestamp,
      profileId: input.profile.id,
      profileName: input.profile.name,
      mode: initial.mode,
      inputAmount: initial.inputAmount,
      amountBs: initial.amountBs,
      bcvRate: input.bcvRate,
      binanceRate: input.binanceRate,
      snapshot: initial.snapshot,
      usdBought: initial.usdBought,
      usdForBinance: initial.usdForBinance,
      usdDeposited: initial.usdDeposited,
      totalCostBs: initial.totalCostBs,
      estimatedBsOut: initial.bsOut,
      estimatedProfitBs: initial.netProfitBs,
      estimatedRoiPct: initial.roiPct,
      breakEvenRate: initial.breakEvenRate,
      requestedInvestmentVes: initial.amountBs,
      requestedUsd: initial.usdBought,
      accreditationType: 'TOTAL',
      accreditedUsd: initial.usdBought,
      accreditationRatePercent: 100,
      executedInvestmentVes: initial.amountBs,
      refundedVes: 0,
      accreditationConfirmedAt: null,
      status: 'pending',
      statusHistory: [],
      execution: null,
      notes: '',
    },
  };
}

describe('recalculateAccreditation', () => {
  it('reproduces the original values exactly for a total accreditation', () => {
    const { purchase, initial } = createPurchaseFixture();
    const result = recalculateAccreditation(purchase, purchase.requestedUsd, false);

    expect(result.accreditationType).toBe('TOTAL');
    expect(result.amountBs).toBe(purchase.requestedInvestmentVes);
    expect(result.refundedVes).toBe(0);
    expect(result.accreditedUsd).toBe(purchase.requestedUsd);
    expect(result.usdForBinance).toBe(initial.usdForBinance);
    expect(result.usdDeposited).toBe(initial.usdDeposited);
    expect(result.bsOut).toBe(initial.bsOut);
    expect(result.totalCostBs).toBe(initial.totalCostBs);
    expect(result.netProfitBs).toBe(initial.netProfitBs);
    expect(result.roiPct).toBe(initial.roiPct);
    expect(result.waterfall).toEqual(initial.waterfall);
  });

  it('scales a proportional partial accreditation and preserves ROI without fixed costs', () => {
    const { purchase, initial } = createPurchaseFixture(
      createInput({ profile: createProfile({ binanceDepositFixedUsd: 0 }) }),
    );
    const accreditedUsd = round2(purchase.requestedUsd / 2);
    const result = recalculateAccreditation(purchase, accreditedUsd, false);

    expect(result.accreditationType).toBe('PARTIAL');
    expect(result.accreditedUsd).toBe(accreditedUsd);
    expect(result.accreditationRatePercent).toBeCloseTo(50, 2);
    expect(result.netForPurchaseBs).toBe(round2(accreditedUsd * purchase.snapshot.bcvRate));
    expect(result.amountBs).toBe(
      round2(result.netForPurchaseBs / (1 - 0.005)),
    );
    expect(result.interventionFeeBs).toBe(
      round2(result.amountBs - result.netForPurchaseBs),
    );
    expect(result.refundedVes).toBe(
      round2(purchase.requestedInvestmentVes - result.amountBs),
    );
    expect(result.amountBs).toBeCloseTo(purchase.requestedInvestmentVes / 2, 0);
    expect(result.usdDeposited).toBeCloseTo(initial.usdDeposited / 2, 0);
    expect(result.roiPct).toBeCloseTo(initial.roiPct, 2);
    expect(result.breakEvenRate).toBeCloseTo(initial.breakEvenRate, 2);
  });

  it('lowers ROI and raises break-even when fixed USD or sunk interbank costs remain', () => {
    const { purchase, initial } = createPurchaseFixture(
      createInput({
        profile: createProfile({ interbankEnabled: true }),
        options: {
          interbankEnabled: true,
          igtfEnabled: false,
          slippageEnabled: false,
        },
      }),
    );
    const half = round2(purchase.requestedUsd / 2);
    const proportional = recalculateAccreditation(purchase, half, false);
    const sunk = recalculateAccreditation(purchase, half, true);

    expect(sunk.interbankCostBs).toBe(purchase.snapshot.interbankCostBs);
    expect(proportional.interbankCostBs).toBeLessThan(sunk.interbankCostBs);
    expect(sunk.totalCostBs).toBeGreaterThan(proportional.totalCostBs);
    expect(sunk.roiPct).toBeLessThan(initial.roiPct);
    expect(sunk.roiPct).toBeLessThan(proportional.roiPct);
    expect(sunk.breakEvenRate).toBeGreaterThan(initial.breakEvenRate);
    expect(sunk.breakEvenRate).toBeGreaterThan(proportional.breakEvenRate);
    expect(sunk.waterfall.find((line) => line.key === 'interbank')?.amountBs).toBe(
      -purchase.snapshot.interbankCostBs,
    );
  });

  it('rejects zero, negative, and above-requested accreditation amounts', () => {
    const { purchase } = createPurchaseFixture();

    expect(() => recalculateAccreditation(purchase, 0, false)).toThrow(
      'Los USD acreditados deben ser mayores que 0',
    );
    expect(() => recalculateAccreditation(purchase, -1, false)).toThrow(
      'Los USD acreditados deben ser mayores que 0',
    );
    expect(() =>
      recalculateAccreditation(purchase, purchase.requestedUsd + 0.01, false),
    ).toThrow('Los USD acreditados no pueden superar los USD solicitados');
  });
});
