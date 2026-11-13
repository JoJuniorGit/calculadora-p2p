import { describe, expect, it } from 'vitest';
import type { BankProfile, CalculationInput, CalculationOptions } from './types';
import {
  ABNORMAL_GAP_PCT,
  calculate,
  calculateMultiRateConversion,
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

const auditedProfile = createProfile({
  cardCommissionPct: 2.5,
  cardCommissionBase: 'usd',
  binanceDepositPct: 4.1,
  binanceDepositFixedUsd: 0.06,
  interbankEnabled: true,
  interbankPct: 0.3,
  interbankBase: 'initial',
  igtfEnabled: false,
  slippageEnabled: false,
});

const auditedInput = createInput({
  mode: 'usd',
  amount: 100,
  bcvRate: 899.2705,
  binanceRate: 1_077.8,
  profile: auditedProfile,
  options: createOptions({ interbankEnabled: true }),
});

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

describe('calculate base and bank fees', () => {
  it('calculates Base_Bs, intervention and total cost for 100 USD at BCV', () => {
    const result = calculate(auditedInput);

    expect(result.baseBs).toBe(89_927.05);
    expect(result.interventionFeeBs).toBe(449.64);
    expect(result.interbankCostBs).toBe(271.13);
    expect(result.bcvPurchaseBs).toBe(90_376.69);
    expect(result.amountBs).toBe(90_647.82);
    expect(result.totalCostBs).toBe(90_647.82);
    expect(result.snapshot.amountBs).toBe(90_647.82);
    expect(result.snapshot.netForPurchaseBs).toBe(89_927.05);
    expect(result.snapshot.baseBs).toBe(89_927.05);
  });

  it('inverts Bs.S mode exactly from the same total cost as USD mode', () => {
    const usdMode = calculate(createInput({ mode: 'usd', amount: 100 }));
    const bsMode = calculate(createInput({ amount: usdMode.amountBs }));

    expect(usdMode.usdBought).toBe(100);
    expect(usdMode.amountBs).toBe(4_020);
    expect(bsMode.amountBs).toBe(usdMode.amountBs);
    expect(bsMode.baseBs).toBe(4_000);
    expect(bsMode.usdBought).toBe(usdMode.usdBought);
  });

  it('calculates intervention only over Base_Bs', () => {
    const result = calculate(createInput());
    const expectedBase = 9_950.25;

    expect(result.amountBs).toBe(10_000);
    expect(result.baseBs).toBe(expectedBase);
    expect(result.interventionFeeBs).toBe(49.75);
    expect(result.bcvPurchaseBs).toBe(10_000);
    expect(result.snapshot.interventionPct).toBe(INTERVENTION_PCT);
  });

  it('anchors Bs.S totals to the entered amount when cents are not representable', () => {
    const result = calculate(
      createInput({
        mode: 'bs',
        amount: 1_234.56,
        profile: createProfile({
          cardCommissionBase: 'ves',
          igtfEnabled: true,
        }),
        options: createOptions({ igtfEnabled: true }),
      }),
    );

    expect(result.amountBs).toBe(1_234.56);
    expect(result.totalCostBs).toBe(1_234.56);
  });

  it('applies the interbank cost sequentially over Base_Bs + intervention', () => {
    const initialBase = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        options: createOptions({ interbankEnabled: true }),
        profile: createProfile({ interbankBase: 'initial' }),
      }),
    );
    const netBase = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        options: createOptions({ interbankEnabled: true }),
        profile: createProfile({ interbankBase: 'net' }),
      }),
    );
    const disabled = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        options: createOptions({ interbankEnabled: false }),
        profile: createProfile({ interbankEnabled: true }),
      }),
    );

    expect(initialBase.interbankCostBs).toBe(12.06);
    expect(initialBase.totalCostBs).toBe(4_032.06);
    expect(netBase.interbankCostBs).toBe(12.06);
    expect(netBase.totalCostBs).toBe(4_032.06);
    expect(disabled.interbankCostBs).toBe(0);
    expect(disabled.totalCostBs).toBe(4_020);
  });

  it('calculates 100 USD at 70 with intervention then interbank sequentially', () => {
    const result = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        bcvRate: 70,
        binanceRate: 80,
        options: createOptions({ interbankEnabled: true }),
        profile: createProfile({
          cardCommissionPct: 0,
          binanceDepositPct: 0,
          interbankPct: 0.3,
          interbankBase: 'initial',
        }),
      }),
    );

    expect(result.baseBs).toBe(7_000);
    expect(result.interventionFeeBs).toBe(35);
    expect(result.bcvPurchaseBs).toBe(7_035);
    expect(result.interbankCostBs).toBe(21.11);
    expect(result.totalCostBs).toBe(7_056.11);
  });

  it('keeps VES card fees in Bs.S without reducing the USD flow', () => {
    const usdBase = calculate(createInput({ mode: 'usd', amount: 100 }));
    const vesBase = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        profile: createProfile({ cardCommissionBase: 'ves' }),
      }),
    );

    expect(vesBase.cardCommissionBs).toBe(80);
    expect(vesBase.cardCommissionUsd).toBe(2);
    expect(vesBase.usdForBinance).toBe(100);
    expect(vesBase.usdDeposited).toBe(99);
    expect(vesBase.usdtNet).toBe(98.5);
    expect(vesBase.bsOut).toBe(4_531);
    expect(vesBase.totalCostBs).toBe(4_100);
    expect(vesBase.netProfitBs).toBe(431);
    expect(vesBase.usdForBinance).not.toBe(usdBase.usdForBinance);
    expect(vesBase.roiPct).not.toBe(usdBase.roiPct);
  });
});

describe('calculate card, Binance and optional fees', () => {
  it('uses the inverse card fee formula and USD_2 as the gateway amount', () => {
    const result = calculate(createInput());

    expect(result.usdBought).toBe(248.76);
    expect(result.cardCommissionUsd).toBe(4.88);
    expect(result.usdForBinance).toBe(243.88);
  });

  it('applies the Binance percentage on USD_2 and always reserves the fixed P2P fee', () => {
    const percentageOnly = calculate(
      createInput({ profile: createProfile({ binanceDepositFixedUsd: 0 }) }),
    );
    const fixedOnly = calculate(
      createInput({
        profile: createProfile({ binanceDepositPct: 0, binanceDepositFixedUsd: 0.5 }),
      }),
    );
    const combined = calculate(createInput());

    expect(percentageOnly.binancePercentFeeUsd).toBe(2.44);
    expect(percentageOnly.binanceFixedFeeUsd).toBe(0.06);
    expect(percentageOnly.usdtNet).toBe(241.38);
    expect(percentageOnly.bsOut).toBe(11_103.48);
    expect(fixedOnly.binancePercentFeeUsd).toBe(0);
    expect(fixedOnly.usdDeposited).toBe(243.88);
    expect(fixedOnly.usdtNet).toBe(243.38);
    expect(fixedOnly.bsOut).toBe(11_195.48);
    expect(combined.binancePercentFeeUsd).toBe(2.44);
    expect(combined.binanceFixedFeeUsd).toBe(0.5);
    expect(combined.usdDeposited).toBe(241.44);
    expect(combined.usdtNet).toBe(240.94);
    expect(combined.bsOut).toBe(11_083.24);
  });

  it('values the fixed P2P fee at the effective sale rate, never at BCV', () => {
    const result = calculate(createInput());

    expect(result.binanceFixedFeeUsd).toBe(0.5);
    expect(result.grossSaleBs).toBe(11_106.24);
    expect(result.binanceFixedDiscountBs).toBe(23);
    expect(result.bsOut).toBe(11_083.24);
    expect(result.bsOut).toBe(result.grossSaleBs - result.binanceFixedDiscountBs);
    expect(result.binanceFixedDiscountBs).not.toBe(result.binanceFixedFeeUsd * 40);
  });

  it('applies IGTF in USD for a USD card charge and in Bs.S for investment base', () => {
    const cardBaseUsd = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        options: createOptions({ igtfEnabled: true }),
        profile: createProfile({ igtfBase: 'card', cardCommissionBase: 'usd' }),
      }),
    );
    const cardBaseVes = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        options: createOptions({ igtfEnabled: true }),
        profile: createProfile({ igtfBase: 'card', cardCommissionBase: 'ves' }),
      }),
    );
    const investmentBase = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        options: createOptions({ igtfEnabled: true }),
        profile: createProfile({ igtfBase: 'investment' }),
      }),
    );

    expect(cardBaseUsd.igtfCostUsd).toBe(0.06);
    expect(cardBaseUsd.igtfCostBs).toBe(0);
    expect(cardBaseUsd.totalCostBs).toBe(4_020);
    expect(cardBaseUsd.usdDeposited).toBe(97);
    expect(cardBaseVes.igtfCostUsd).toBe(0);
    expect(cardBaseVes.igtfCostBs).toBe(2.4);
    expect(cardBaseVes.totalCostBs).toBe(4_102.4);
    expect(investmentBase.igtfCostUsd).toBe(0);
    expect(investmentBase.igtfCostBs).toBe(120.6);
    expect(investmentBase.totalCostBs).toBe(4_140.6);
  });

  it('applies slippage to the effective sale rate and to the break-even', () => {
    const withoutSlippage = calculate(createInput());
    const withSlippage = calculate(
      createInput({ options: createOptions({ slippageEnabled: true }) }),
    );

    expect(withoutSlippage.binanceEffectiveRate).toBe(46);
    expect(withSlippage.binanceEffectiveRate).toBeCloseTo(45.08, 12);
    expect(withSlippage.bsOut).toBe(10_861.58);
    expect(withSlippage.bsOut).toBeLessThan(withoutSlippage.bsOut);
    expect(withSlippage.effectiveBuyRate).toBeGreaterThan(
      withoutSlippage.effectiveBuyRate,
    );
    expect(withSlippage.effectiveBuyRate).toBeCloseTo(
      withSlippage.totalCostBs / withSlippage.usdtNet / 0.98,
      12,
    );
    expect(withSlippage.minGapPct).toBe(
      ((withSlippage.effectiveBuyRate - withSlippage.snapshot.bcvRate) /
        withSlippage.snapshot.bcvRate) *
        100,
    );
  });
});

describe('calculate profitability and break-even', () => {
  it('marks a below-break-even sale as a red loss', () => {
    const result = calculate(createInput({ binanceRate: 35 }));

    expect(result.netProfitBs).toBeLessThan(0);
    expect(result.profitability).toBe('red');
  });

  it('returns exactly zero profit when recalculated at the effective buy rate', () => {
    const input = createInput();
    const initial = calculate(input);
    const atBreakEven = calculate({
      ...input,
      binanceRate: initial.effectiveBuyRate,
    });

    expect(atBreakEven.netProfitBs).toBe(0);
  });

  it('keeps the break-even independent from the P2P quote', () => {
    const atLow = calculate({ ...auditedInput, binanceRate: 500 });
    const atBase = calculate(auditedInput);
    const atHigh = calculate({ ...auditedInput, binanceRate: 1_500 });

    expect(atLow.effectiveBuyRate).toBe(atBase.effectiveBuyRate);
    expect(atHigh.effectiveBuyRate).toBe(atBase.effectiveBuyRate);
    expect(atLow.effectiveBuyRate).toBeGreaterThan(0);
  });

  it('returns consistent full-precision break-even and minimum-gap metrics', () => {
    const result = calculate(createInput());

    expect(result.effectiveBuyRate).toBeGreaterThan(0);
    expect(result.breakEvenRate).toBe(result.effectiveBuyRate);
    expect(result.effectiveBuyRate).toBe(
      result.totalCostBs / result.usdtNet,
    );
    expect(result.minGapPct).toBe(
      ((result.effectiveBuyRate - 40) / 40) * 100,
    );
  });

  it('rejects non-positive amounts, rates and exhausted USD', () => {
    expect(() => calculate(createInput({ amount: 0 }))).toThrow(
      'El monto debe ser mayor que 0',
    );
    expect(() => calculate(createInput({ bcvRate: 0 }))).toThrow(
      'La tasa BCV debe ser mayor que 0',
    );
    expect(() => calculate(createInput({ binanceRate: 0 }))).toThrow(
      'La tasa Binance debe ser mayor que 0',
    );
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

describe('mandatory financial audit tests', () => {
  it('enforces the mandatory 0.06 USDT fixed sale fee when the profile sets zero', () => {
    const result = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        bcvRate: 100,
        binanceRate: 1_000,
        profile: createProfile({
          cardCommissionPct: 0,
          binanceDepositPct: 0,
          binanceDepositFixedUsd: 0,
        }),
      }),
    );

    expect(result.binanceFixedFeeUsd).toBe(0.06);
    expect(result.snapshot.binanceDepositFixedUsd).toBe(0.06);
    expect(result.usdtNet).toBe(99.94);
    expect(result.bsOut).toBe(99_940);
  });

  it('deducts the fixed 0.06 USDT P2P fee at the effective sale rate', () => {
    const result = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        bcvRate: 100,
        binanceRate: 1_000,
        profile: createProfile({
          cardCommissionPct: 0,
          binanceDepositPct: 0,
          binanceDepositFixedUsd: 0.06,
        }),
      }),
    );

    expect(result.usdDeposited).toBe(100);
    expect(result.usdtNet).toBe(99.94);
    expect(result.grossSaleBs).toBe(100_000);
    expect(result.binanceFixedDiscountBs).toBe(60);
    expect(result.bsOut).toBe(99_940);
  });

  it('reproduces the audited 100 USD bank operation', () => {
    const result = calculate(auditedInput);

    expect(result.amountBs).toBe(90_647.82);
    expect(result.totalCostBs).toBe(90_647.82);
    expect(result.usdForBinance).toBe(97.56);
    expect(result.usdDeposited).toBe(93.56);
    expect(result.usdtNet).toBe(93.5);
    expect(result.bsOut).toBe(100_774.3);
    expect(result.grossSaleBs).toBe(100_838.97);
    expect(result.binanceFixedDiscountBs).toBe(64.67);
    expect(result.effectiveBuyRate).toBeCloseTo(969.5, 2);
    expect(result.breakEvenRate).toBe(result.effectiveBuyRate);
  });

  it('keeps the audited break-even identical across P2P quotes and yields zero at it', () => {
    const base = calculate(auditedInput);
    const high = calculate({ ...auditedInput, binanceRate: 1_500 });
    const low = calculate({ ...auditedInput, binanceRate: 500 });
    const atBreakEven = calculate({
      ...auditedInput,
      binanceRate: base.effectiveBuyRate,
    });

    expect(high.effectiveBuyRate).toBe(base.effectiveBuyRate);
    expect(low.effectiveBuyRate).toBe(base.effectiveBuyRate);
    expect(atBreakEven.netProfitBs).toBe(0);
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
  it('includes the audited stages and values only when enabled', () => {
    const input = createInput({
      mode: 'usd',
      amount: 100,
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
      'net-purchase',
      'intervention',
      'interbank',
      'card-commission',
      'igtf',
      'usd-bought',
      'usd-for-binance',
      'binance-deposit',
      'usdt-net',
      'binance-fixed',
      'usdt-sale-net',
      'slippage',
      'gross-sale',
      'bs-out',
      'total-cost',
      'net-profit',
    ]);
    expect(lines.get('investment')?.amountBs).toBe(4_032.06);
    expect(lines.get('net-purchase')?.amountBs).toBe(4_000);
    expect(lines.get('intervention')?.amountBs).toBe(-20);
    expect(lines.get('interbank')?.amountBs).toBe(-12.06);
    expect(lines.get('card-commission')?.amountUsd).toBe(-1.96);
    expect(lines.get('igtf')?.amountUsd).toBe(-0.06);
    expect(lines.get('binance-deposit')?.amountUsd).toBe(-0.98);
    expect(lines.get('usdt-net')?.amountUsd).toBe(97);
    expect(lines.get('binance-fixed')?.amountUsd).toBe(-0.5);
    expect(lines.get('binance-fixed')?.amountBs).toBe(-22.54);
    expect(lines.get('usdt-sale-net')?.amountUsd).toBe(96.5);
    expect(lines.get('gross-sale')?.amountBs).toBe(4_372.76);
    expect(lines.get('bs-out')?.amountBs).toBe(4_350.22);
    expect(lines.get('slippage')).toMatchObject({
      kind: 'info',
      detail: 'La tasa Binance efectiva ya incluye el deslizamiento',
    });
    expect(lines.get('card-commission')?.label).toBe('Comisión de tarjeta (2%)');
    expect(lines.get('binance-deposit')?.label).toBe('Comisión Binance (1%)');
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
      baseBs: result.baseBs,
      netForPurchaseBs: result.baseBs,
      bcvRate: input.bcvRate,
      binanceRate: input.binanceRate,
      cardCommissionBase: input.profile.cardCommissionBase,
      interbankEnabled: true,
      igtfEnabled: true,
      slippageEnabled: true,
      binanceDepositUsd: result.binancePercentFeeUsd,
      usdtNet: result.usdtNet,
      effectiveBuyRate: result.effectiveBuyRate,
    });
  });

  it('omits disabled optional rows and shows a VES card charge in Bs', () => {
    const disabled = calculate(createInput());
    const vesCard = calculate(
      createInput({
        mode: 'usd',
        amount: 100,
        profile: createProfile({ cardCommissionBase: 'ves' }),
      }),
    );
    const disabledKeys = disabled.waterfall.map((line) => line.key);
    const vesCardLine = vesCard.waterfall.find((line) => line.key === 'card-commission');

    expect(disabledKeys).not.toContain('interbank');
    expect(disabledKeys).not.toContain('igtf');
    expect(disabledKeys).not.toContain('slippage');
    expect(vesCardLine).toMatchObject({
      amountBs: -80,
      amountUsd: null,
      detail: 'Cobrada extra en Bs.S',
    });
  });
});

describe('calculateMultiRateConversion', () => {
  it('converts Bs.S into BCV and Binance USD equivalents', () => {
    const result = calculateMultiRateConversion('VES', 11_730, 40, 46);

    expect(result.vesAmount).toBe(11_730);
    expect(result.slot1Usd).toBe(293.25);
    expect(result.slot2Usd).toBe(255);
    expect(result.usdDifference).toBe(38.25);
    expect(result.spreadPercentBetweenSlots).toBe(15);
  });

  it('derives the exact Bs.S from Slot 1 USD and the USDT needed in Slot 2', () => {
    const result = calculateMultiRateConversion('SLOT_1', 250, 40, 46);

    expect(result.slot1Usd).toBe(250);
    expect(result.vesAmount).toBe(10_000);
    expect(result.slot2Usd).toBe(217.39);
    expect(result.usdDifference).toBe(32.61);
  });

  it('converts USDT from Slot 2 into Bs.S and its Slot 1 USD equivalent', () => {
    const result = calculateMultiRateConversion('SLOT_2', 100, 40, 46);

    expect(result.slot2Usd).toBe(100);
    expect(result.vesAmount).toBe(4_600);
    expect(result.slot1Usd).toBe(115);
    expect(result.usdDifference).toBe(15);
  });

  it('handles a zero amount without divisions by zero or NaN', () => {
    const result = calculateMultiRateConversion('VES', 0, 40, 46);

    expect(result.vesAmount).toBe(0);
    expect(result.slot1Usd).toBe(0);
    expect(result.slot2Usd).toBe(0);
    expect(result.usdDifference).toBe(0);
    expect(result.spreadPercentBetweenSlots).toBe(15);
    expect(Object.values(result).some((value) => Number.isNaN(value))).toBe(false);
  });

  it('returns a zeroed result when a rate is missing instead of NaN', () => {
    expect(calculateMultiRateConversion('SLOT_1', 100, 0, 46)).toEqual({
      vesAmount: 0,
      slot1Usd: 0,
      slot2Usd: 0,
      usdDifference: 0,
      spreadPercentBetweenSlots: 0,
    });
  });
});
