import { describe, expect, it } from 'vitest';
import type { BankProfile, CalculationInput, CalculationOptions } from './types';
import {
  ABNORMAL_GAP_PCT,
  calculate,
  getExchangeGap,
  INTERVENTION_PCT,
  round2,
} from './calculations';

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
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createOptions(overrides: Partial<CalculationOptions> = {}): CalculationOptions {
  return {
    interbankEnabled: false,
    igtfEnabled: false,
    slippageEnabled: false,
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
    options: createOptions(),
    ...overrides,
  };
}

describe('round2', () => {
  it('rounds decimal-shift edge cases symmetrically to cents', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-2.675)).toBe(-2.68);
  });

  it('leaves non-finite values unchanged', () => {
    expect(round2(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(round2(Number.NaN))).toBe(true);
  });
});

describe('calculate', () => {
  it('grosses up the USD card fee and rounds each monetary stage', () => {
    const result = calculate(createInput());

    expect(result.amountBs).toBe(10_000);
    expect(result.interventionFeeBs).toBe(50);
    expect(result.netForPurchaseBs).toBe(9_950);
    expect(result.usdBought).toBe(248.75);
    expect(result.cardCommissionUsd).toBe(4.88);
    expect(result.usdForBinance).toBe(243.87);
    expect(result.binanceFeeUsd).toBe(2.94);
    expect(result.usdDeposited).toBe(240.93);
    expect(result.bsOut).toBe(11_082.78);
    expect(result.totalCostBs).toBe(10_000);
    expect(result.netProfitBs).toBe(1_082.78);
    expect(result.roiPct).toBeCloseTo(10.8278, 8);
    expect(result.profitability).toBe('green');
    expect(result.snapshot.interventionPct).toBe(INTERVENTION_PCT);
  });

  it('grosses up the Binance deposit from the requested bank USD', () => {
    const result = calculate(createInput({ mode: 'usd', amount: 300 }));

    expect(result.usdBought).toBe(300);
    expect(result.usdForBinance).toBe(round2(300 / 1.02));
    expect(result.cardCommissionUsd).toBe(round2(300 - round2(300 / 1.02)));
  });

  it('charges a VES-based card commission as extra Bs without reducing USD flow', () => {
    const usdBase = calculate(createInput());
    const vesBase = calculate(
      createInput({ profile: createProfile({ cardCommissionBase: 'ves' }) }),
    );

    expect(vesBase.cardCommissionBs).toBe(199);
    expect(vesBase.cardCommissionUsd).toBe(4.98);
    expect(vesBase.usdForBinance).toBe(248.75);
    expect(vesBase.usdDeposited).toBe(245.76);
    expect(vesBase.bsOut).toBe(11_304.96);
    expect(vesBase.totalCostBs).toBe(10_199);
    expect(vesBase.netProfitBs).toBe(1_105.96);
    expect(vesBase.usdDeposited).not.toBe(usdBase.usdDeposited);
    expect(vesBase.roiPct).not.toBe(usdBase.roiPct);
  });

  it('calculates IGTF from the card charge or the initial investment', () => {
    const cardBase = calculate(
      createInput({
        options: createOptions({ igtfEnabled: true }),
        profile: createProfile({ igtfBase: 'card' }),
      }),
    );
    const investmentBase = calculate(
      createInput({
        options: createOptions({ igtfEnabled: true }),
        profile: createProfile({ igtfBase: 'investment' }),
      }),
    );

    expect(cardBase.igtfCostBs).toBe(5.86);
    expect(cardBase.totalCostBs).toBe(10_005.86);
    expect(investmentBase.igtfCostBs).toBe(300);
    expect(investmentBase.totalCostBs).toBe(10_300);
    expect(cardBase.roiPct).not.toBe(investmentBase.roiPct);
  });

  it('calculates interbank costs from initial or net Bs and honors the effective toggle', () => {
    const initialBase = calculate(
      createInput({
        options: createOptions({ interbankEnabled: true }),
        profile: createProfile({ interbankBase: 'initial' }),
      }),
    );
    const netBase = calculate(
      createInput({
        options: createOptions({ interbankEnabled: true }),
        profile: createProfile({ interbankBase: 'net' }),
      }),
    );
    const disabled = calculate(
      createInput({
        options: createOptions({ interbankEnabled: false }),
        profile: createProfile({ interbankEnabled: true }),
      }),
    );

    expect(initialBase.interbankCostBs).toBe(30);
    expect(initialBase.totalCostBs).toBe(10_030);
    expect(netBase.interbankCostBs).toBe(29.85);
    expect(netBase.totalCostBs).toBe(10_029.85);
    expect(disabled.interbankCostBs).toBe(0);
    expect(disabled.totalCostBs).toBe(10_000);
  });

  it('supports percentage-only, fixed-only, and combined Binance deposit fees', () => {
    const percentageOnly = calculate(
      createInput({ profile: createProfile({ binanceDepositFixedUsd: 0 }) }),
    );
    const fixedOnly = calculate(
      createInput({
        profile: createProfile({ binanceDepositPct: 0, binanceDepositFixedUsd: 0.5 }),
      }),
    );
    const combined = calculate(createInput());

    expect(percentageOnly.binanceFeeUsd).toBe(2.44);
    expect(fixedOnly.binanceFeeUsd).toBe(0.5);
    expect(combined.binanceFeeUsd).toBe(2.94);
  });

  it('applies slippage only when enabled and keeps effective-rate metrics unrounded', () => {
    const withoutSlippage = calculate(createInput());
    const withSlippage = calculate(
      createInput({ options: createOptions({ slippageEnabled: true }) }),
    );

    expect(withoutSlippage.binanceEffectiveRate).toBe(46);
    expect(withSlippage.binanceEffectiveRate).toBeCloseTo(45.08, 12);
    expect(withSlippage.bsOut).toBe(10_861.12);
    expect(withSlippage.bsOut).toBeLessThan(withoutSlippage.bsOut);
    expect(withSlippage.breakEvenRate).toBe(withoutSlippage.breakEvenRate);
    expect(withSlippage.breakEvenRate).toBe(
      withSlippage.totalCostBs / withSlippage.usdDeposited,
    );
    expect(withSlippage.minGapPct).toBe(
      ((withSlippage.breakEvenRate - withSlippage.snapshot.bcvRate) /
        withSlippage.snapshot.bcvRate) *
        100,
    );
  });

  it('marks a below-break-even sale as a red loss', () => {
    const result = calculate(createInput({ binanceRate: 35 }));

    expect(result.netProfitBs).toBeLessThan(0);
    expect(result.profitability).toBe('red');
  });

  it('returns exactly zero profit when recalculated at the break-even rate', () => {
    const input = createInput();
    const initial = calculate(input);
    const atBreakEven = calculate({ ...input, binanceRate: initial.breakEvenRate });

    expect(atBreakEven.netProfitBs).toBe(0);
  });

  it('returns consistent full-precision break-even and minimum-gap metrics', () => {
    const result = calculate(createInput());

    expect(result.breakEvenRate).toBeGreaterThan(0);
    expect(result.breakEvenRate).toBe(result.totalCostBs / result.usdDeposited);
    expect(result.minGapPct).toBeGreaterThan(0);
    expect(result.minGapPct).toBe(
      ((result.breakEvenRate - 40) / 40) * 100,
    );
  });

  it('produces equivalent bank USD for exact-USD and matching Bs input modes', () => {
    const usdMode = calculate(createInput({ mode: 'usd', amount: 100 }));
    const bsMode = calculate(createInput({ amount: 4_020.1 }));

    expect(usdMode.amountBs).toBe(4_020.1);
    expect(usdMode.usdBought).toBe(100);
    expect(bsMode.usdBought).toBe(usdMode.usdBought);
  });

  it.each([
    ['amount', { amount: 0 }],
    ['BCV rate', { bcvRate: 0 }],
    ['Binance rate', { binanceRate: 0 }],
  ])('rejects a non-positive %s', (_field, overrides) => {
    expect(() => calculate(createInput(overrides))).toThrow(Error);
  });

  it('rejects non-finite inputs and fees that exhaust available USD', () => {
    expect(() => calculate(createInput({ amount: Number.POSITIVE_INFINITY }))).toThrow(
      'El monto debe ser mayor que 0',
    );
    expect(() =>
      calculate(
        createInput({
          profile: createProfile({ binanceDepositPct: 100, binanceDepositFixedUsd: 1 }),
        }),
      ),
    ).toThrow('Las comisiones superan los USD disponibles para operar');
  });
});

describe('getExchangeGap', () => {
  it('uses the effective BCV rate (BCV + 0.50% intervention) as the gap baseline', () => {
    const gap = getExchangeGap(40, 46);

    expect(gap.effectiveBcvRate).toBeCloseTo(40.2, 10);
    expect(gap.absoluteBs).toBeCloseTo(5.8, 10);
    expect(gap.pct).toBeCloseTo((5.8 / 40.2) * 100, 10);
    expect(gap.abnormal).toBe(false);

    const otherGap = getExchangeGap(100, 110);
    expect(otherGap.effectiveBcvRate).toBeCloseTo(100.5, 10);
    expect(otherGap.absoluteBs).toBeCloseTo(9.5, 10);
    expect(otherGap.pct).toBeCloseTo((9.5 / 100.5) * 100, 10);
  });

  it('flags the abnormal threshold against the effective BCV rate', () => {
    const abnormalGap = getExchangeGap(40, 61);
    expect(abnormalGap.pct).toBeGreaterThanOrEqual(ABNORMAL_GAP_PCT);
    expect(abnormalGap.abnormal).toBe(true);

    const belowThreshold = getExchangeGap(40, 60);
    expect(belowThreshold.pct).toBeLessThan(ABNORMAL_GAP_PCT);
    expect(belowThreshold.abnormal).toBe(false);
  });

  it('rejects a non-positive or non-finite BCV rate', () => {
    expect(() => getExchangeGap(0, 46)).toThrow('La tasa BCV debe ser mayor que 0');
    expect(() => getExchangeGap(Number.NaN, 46)).toThrow(
      'La tasa BCV debe ser mayor que 0',
    );
  });
});

describe('calculation waterfall', () => {
  it('includes optional rows only when enabled and records their effective inputs', () => {
    const input = createInput({
      options: createOptions({
        interbankEnabled: true,
        igtfEnabled: true,
        slippageEnabled: true,
      }),
    });
    const result = calculate(input);
    const lines = new Map(result.waterfall.map((line) => [line.key, line]));

    expect([...lines.keys()]).toEqual([
      'investment',
      'intervention',
      'net-purchase',
      'usd-bought',
      'card-commission',
      'usd-for-binance',
      'binance-deposit',
      'usdt-net',
      'interbank',
      'igtf',
      'slippage',
      'bs-out',
      'total-cost',
      'net-profit',
    ]);
    expect(lines.get('intervention')?.amountBs).toBe(-50);
    expect(lines.get('intervention')?.label).toBe('Comisión por intervención (0,50%)');
    expect(lines.get('card-commission')?.amountUsd).toBe(-4.88);
    expect(lines.get('binance-deposit')?.amountUsd).toBe(-2.94);
    expect(lines.get('interbank')?.amountBs).toBe(-30);
    expect(lines.get('igtf')?.amountBs).toBe(-5.86);
    expect(lines.get('slippage')).toMatchObject({
      kind: 'info',
      detail: 'La tasa Binance efectiva ya incluye el deslizamiento',
    });
    expect(lines.get('card-commission')?.label).toBe('Comisión de tarjeta (2%)');
    expect(lines.get('binance-deposit')?.label).toBe('Comisión Binance (1% + 0,5 USD)');
    expect(lines.get('interbank')?.label).toBe('Costo interbancario (0,3%)');
    expect(lines.get('igtf')?.label).toBe('IGTF (3%)');
    expect(
      result.waterfall
        .filter((line) => line.kind === 'cost')
        .every((line) => (line.amountBs ?? line.amountUsd ?? 0) <= 0),
    ).toBe(true);
    expect(result.snapshot).toMatchObject({
      profileId: input.profile.id,
      profileName: input.profile.name,
      mode: input.mode,
      inputAmount: input.amount,
      amountBs: result.amountBs,
      bcvRate: input.bcvRate,
      binanceRate: input.binanceRate,
      cardCommissionBase: input.profile.cardCommissionBase,
      interbankEnabled: true,
      igtfEnabled: true,
      slippageEnabled: true,
      binanceDepositUsd: result.binanceFeeUsd,
    });
  });

  it('omits disabled optional rows and shows a VES card charge in Bs', () => {
    const disabled = calculate(createInput());
    const vesCard = calculate(
      createInput({ profile: createProfile({ cardCommissionBase: 'ves' }) }),
    );
    const disabledKeys = disabled.waterfall.map((line) => line.key);
    const vesCardLine = vesCard.waterfall.find((line) => line.key === 'card-commission');

    expect(disabledKeys).not.toContain('interbank');
    expect(disabledKeys).not.toContain('igtf');
    expect(disabledKeys).not.toContain('slippage');
    expect(vesCardLine).toMatchObject({
      amountBs: -199,
      amountUsd: null,
      detail: 'Cobrada extra en Bs.S',
    });
  });
});
