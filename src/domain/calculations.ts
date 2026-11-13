import type {
  AccreditationType,
  BankProfile,
  CalculationInput,
  CalculationOptions,
  CalculationResult,
  CalculationSnapshot,
  CommissionBase,
  InterbankBase,
  IgtfBase,
  MultiRateConversionResult,
  MultiRateSource,
  Profitability,
  PurchaseRecord,
  PurchaseStatus,
  SaleInput,
  SaleLotAllocation,
  SaleRecord,
  WaterfallLine,
} from './types';

export const INTERVENTION_PCT = 0.5;
export const PROFITABILITY_GREEN_MIN_PCT = 3;
export const PROFITABILITY_YELLOW_MIN_PCT = 0;
export const ABNORMAL_GAP_PCT = 50;
export const DEFAULT_P2P_FIXED_FEE_USDT = 0.06;

export interface ExchangeGap {
  /** Gap percentage measured against the effective BCV rate. */
  pct: number;
  /** Absolute gap in Bs.S over the effective BCV rate. */
  absoluteBs: number;
  /** BCV rate plus the fixed 0.50% intervention commission. */
  effectiveBcvRate: number;
  abnormal: boolean;
}

interface CalculationContextProfile {
  cardCommissionPct: number;
  cardCommissionBase: CommissionBase;
  binanceDepositPct: number;
  binanceDepositFixedUsd: number;
  interbankPct: number;
  interbankBase: InterbankBase;
  igtfPct: number;
  igtfBase: IgtfBase;
  slippagePct: number;
}

interface CalculationContext {
  bcvRate: number;
  binanceRate: number;
  profile: CalculationContextProfile;
  options: CalculationOptions;
}

/** Base stages: USD_1 and its Bs.S base at BCV. */
interface BaseAmounts {
  /** USD_1 × BCV. */
  baseBs: number;
  /** Base_Bs × 0.50%. */
  interventionFeeBs: number;
  /** Base_Bs + intervention; the Bs.S dedicated to the BCV purchase. */
  bcvPurchaseBs: number;
  /** USD credited at the bank (USD_1). */
  usdBought: number;
}

interface DownstreamAmounts {
  /** Total Bs.S cost (Base_Bs + all Bs.S fees). */
  amountBs: number;
  /** Base_Bs (compatibility field). */
  netForPurchaseBs: number;
  cardCommissionUsd: number;
  cardCommissionBs: number;
  /** USD_2: USD that travels through the Binance gateway. */
  usdForBinance: number;
  /** Percentage-only Binance deposit fee. */
  binancePercentFeeUsd: number;
  /** Fixed P2P fee in USDT. */
  binanceFixedFeeUsd: number;
  /** Fixed P2P fee valued at the effective sale rate, in Bs.S. */
  binanceFixedDiscountBs: number;
  /** Legacy total (percentage + fixed) for display compatibility. */
  binanceFeeUsd: number;
  /** USD_3: USDT after the percentage fee and USD IGTF, before the fixed fee. */
  usdDeposited: number;
  /** USDT available to sell after the fixed P2P fee. */
  usdtNet: number;
  interbankCostBs: number;
  igtfCostBs: number;
  igtfCostUsd: number;
  binanceEffectiveRate: number;
  /** Gross P2P sale before the fixed P2P fee. */
  grossSaleBs: number;
  bsOut: number;
  totalCostBs: number;
  netProfitBs: number;
  roiPct: number;
  /** Minimum quoted Binance sale rate for zero profit. */
  effectiveBuyRate: number;
  /** Alias of effectiveBuyRate for existing consumers. */
  breakEvenRate: number;
  minGapPct: number;
  profitability: Profitability;
}

export interface AccreditationResult extends BaseAmounts, DownstreamAmounts {
  accreditedUsd: number;
  accreditationType: AccreditationType;
  accreditationRatePercent: number;
  /** Bs.S released back to the current account. */
  refundedVes: number;
  keepInterbankSunk: boolean;
  waterfall: WaterfallLine[];
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Number(`${Math.round(Number(`${Math.abs(value)}e2`))}e-2`);
}

const EMPTY_MULTI_RATE_CONVERSION: MultiRateConversionResult = {
  vesAmount: 0,
  slot1Usd: 0,
  slot2Usd: 0,
  usdDifference: 0,
  spreadPercentBetweenSlots: 0,
};

/**
 * Converts amounts between Bs.S and up to two rate slots using the bolívar as
 * the pivot. `source` marks which field the user typed in; the other two are
 * derived from it. Invalid rates or amounts return a zeroed result instead of
 * throwing or producing NaN.
 */
export function calculateMultiRateConversion(
  source: MultiRateSource,
  amount: number,
  rate1: number,
  rate2: number,
): MultiRateConversionResult {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const safeRate1 = Number.isFinite(rate1) && rate1 > 0 ? rate1 : 0;
  const safeRate2 = Number.isFinite(rate2) && rate2 > 0 ? rate2 : 0;

  if (safeRate1 <= 0 || safeRate2 <= 0) {
    return { ...EMPTY_MULTI_RATE_CONVERSION };
  }

  let vesAmount: number;
  let slot1Usd: number;
  let slot2Usd: number;

  if (source === 'VES') {
    vesAmount = round2(safeAmount);
    slot1Usd = round2(vesAmount / safeRate1);
    slot2Usd = round2(vesAmount / safeRate2);
  } else if (source === 'SLOT_1') {
    slot1Usd = round2(safeAmount);
    vesAmount = round2(slot1Usd * safeRate1);
    slot2Usd = round2(vesAmount / safeRate2);
  } else {
    slot2Usd = round2(safeAmount);
    vesAmount = round2(slot2Usd * safeRate2);
    slot1Usd = round2(vesAmount / safeRate1);
  }

  const minRate = Math.min(safeRate1, safeRate2);
  const maxRate = Math.max(safeRate1, safeRate2);

  return {
    vesAmount,
    slot1Usd,
    slot2Usd,
    usdDifference: round2(Math.abs(slot1Usd - slot2Usd)),
    spreadPercentBetweenSlots: round2(((maxRate - minRate) / minRate) * 100),
  };
}

/**
 * Effective BCV purchase rate: the quoted BCV rate plus the fixed 0.50%
 * intervention commission. Used as the baseline for the exchange gap.
 */
export function getEffectiveBcvRate(bcvRate: number): number {
  if (!Number.isFinite(bcvRate) || bcvRate <= 0) {
    throw new Error('La tasa BCV debe ser mayor que 0');
  }

  return bcvRate + bcvRate * (INTERVENTION_PCT / 100);
}

export function getExchangeGap(bcvRate: number, binanceRate: number): ExchangeGap {
  const effectiveBcvRate = getEffectiveBcvRate(bcvRate);
  const absoluteBs = binanceRate - effectiveBcvRate;
  const pct = (absoluteBs / effectiveBcvRate) * 100;

  return {
    pct,
    absoluteBs,
    effectiveBcvRate,
    abnormal: pct >= ABNORMAL_GAP_PCT,
  };
}

function formatNumberLabel(value: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

function formatPctLabel(value: number): string {
  return `${formatNumberLabel(value)}%`;
}

function positiveModifier(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Builds the base stages from a Bs.S base at BCV. */
function baseFromBaseBs(baseBsInput: number, bcvRate: number): BaseAmounts {
  const baseBs = round2(baseBsInput);
  const interventionFeeBs = round2(baseBs * (INTERVENTION_PCT / 100));

  return {
    baseBs,
    interventionFeeBs,
    bcvPurchaseBs: round2(baseBs + interventionFeeBs),
    usdBought: round2(baseBs / bcvRate),
  };
}

/** Builds the base stages from the exact USD_1 requested from the bank. */
function baseFromUsd(usdInput: number, bcvRate: number): BaseAmounts {
  return baseFromBaseBs(round2(usdInput) * bcvRate, bcvRate);
}

/**
 * Estimates the Bs.S base that produces a target total cost, ignoring cent
 * rounding. The estimate is then adjusted over neighboring cents below.
 */
function estimateBaseForTotal(totalCost: number, context: CalculationContext): number {
  const intervention = INTERVENTION_PCT / 100;
  const interbank = context.options.interbankEnabled
    ? context.profile.interbankPct / 100
    : 0;
  const cardVes =
    context.profile.cardCommissionBase === 'ves'
      ? context.profile.cardCommissionPct / 100
      : 0;
  const igtf = context.options.igtfEnabled
    ? context.profile.igtfPct / 100
    : 0;

  const interbankCoefficient = (1 + intervention) * interbank;

  const igtfCoefficient =
    context.options.igtfEnabled && context.profile.igtfBase === 'investment'
      ? (1 + intervention + interbankCoefficient + cardVes) * igtf
      : context.options.igtfEnabled && context.profile.igtfBase === 'card'
        ? cardVes * igtf
        : 0;

  return totalCost / (1 + intervention + interbankCoefficient + cardVes + igtfCoefficient);
}

/**
 * Solves Base_Bs so the rounded total Bs.S cost equals the requested amount.
 * The search works in cents and picks the closest reachable total.
 */
function solveBaseForTotal(totalCost: number, context: CalculationContext): BaseAmounts {
  const estimate = round2(estimateBaseForTotal(totalCost, context));
  let best = baseFromBaseBs(estimate, context.bcvRate);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let offset = -200; offset <= 200; offset += 1) {
    const candidateBase = round2(estimate + offset * 0.01);
    if (candidateBase <= 0) continue;

    const candidate = baseFromBaseBs(candidateBase, context.bcvRate);
    let candidateTotal: number;
    try {
      candidateTotal = calculateDownstream(candidate, context).amountBs;
    } catch {
      continue;
    }

    const distance = Math.abs(candidateTotal - totalCost);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
    if (distance === 0) break;
  }

  return best;
}

function calculateDownstream(
  base: BaseAmounts,
  context: CalculationContext,
  sunkInterbankCostBs?: number,
): DownstreamAmounts {
  const { profile, options } = context;
  const usd1 = base.baseBs / context.bcvRate;

  let cardCommissionUsd: number;
  let cardCommissionBs: number;
  let usdForBinance: number;

  if (profile.cardCommissionBase === 'usd') {
    // Real inverse card fee: the bank retains its percentage over the amount
    // that finally passes through the gateway.
    usdForBinance = round2(usd1 / (1 + profile.cardCommissionPct / 100));
    cardCommissionUsd = round2(usd1 - usdForBinance);
    cardCommissionBs = round2(cardCommissionUsd * context.bcvRate);
  } else {
    cardCommissionBs = round2(base.baseBs * (profile.cardCommissionPct / 100));
    cardCommissionUsd = round2(cardCommissionBs / context.bcvRate);
    usdForBinance = base.usdBought;
  }

  const binancePercentFeeUsd = round2(
    usdForBinance * (profile.binanceDepositPct / 100),
  );
  const binanceFixedFeeUsd = round2(
    Math.max(
      positiveModifier(profile.binanceDepositFixedUsd),
      DEFAULT_P2P_FIXED_FEE_USDT,
    ),
  );
  const binanceFeeUsd = round2(binancePercentFeeUsd + binanceFixedFeeUsd);

  const interbankCostBs = options.interbankEnabled
    ? sunkInterbankCostBs !== undefined
      ? round2(sunkInterbankCostBs)
      : round2(
          round2(base.baseBs + base.interventionFeeBs) *
            (profile.interbankPct / 100),
        )
    : 0;

  let igtfCostBs = 0;
  let igtfCostUsd = 0;
  if (options.igtfEnabled) {
    if (profile.igtfBase === 'card') {
      if (profile.cardCommissionBase === 'usd') {
        igtfCostUsd = round2(cardCommissionUsd * (profile.igtfPct / 100));
      } else {
        igtfCostBs = round2(cardCommissionBs * (profile.igtfPct / 100));
      }
    } else {
      const investmentBaseBs = round2(
        base.baseBs +
          base.interventionFeeBs +
          interbankCostBs +
          (profile.cardCommissionBase === 'ves' ? cardCommissionBs : 0),
      );
      igtfCostBs = round2(investmentBaseBs * (profile.igtfPct / 100));
    }
  }

  const usdDeposited = round2(usdForBinance - binancePercentFeeUsd - igtfCostUsd);
  if (usdDeposited <= 0) {
    throw new Error('Las comisiones superan los USD disponibles para operar');
  }

  const usdtNet = round2(Math.max(0, usdDeposited - binanceFixedFeeUsd));
  const binanceEffectiveRate = options.slippageEnabled
    ? context.binanceRate * (1 - profile.slippagePct / 100)
    : context.binanceRate;
  const grossSaleBs = round2(usdDeposited * binanceEffectiveRate);
  const binanceFixedDiscountBs = round2(
    (usdDeposited - usdtNet) * binanceEffectiveRate,
  );
  const bsOut = round2(usdtNet * binanceEffectiveRate);
  const totalCostBs = round2(
    base.baseBs +
      base.interventionFeeBs +
      interbankCostBs +
      (profile.cardCommissionBase === 'ves' ? cardCommissionBs : 0) +
      igtfCostBs,
  );
  const netProfitBs = round2(bsOut - totalCostBs);
  const roiPct = totalCostBs > 0 ? (netProfitBs / totalCostBs) * 100 : 0;
  const slippageFraction = options.slippageEnabled ? profile.slippagePct / 100 : 0;
  const effectiveBuyRate =
    usdtNet > 0 ? totalCostBs / usdtNet / (1 - slippageFraction) : 0;
  const minGapPct =
    context.bcvRate > 0
      ? ((effectiveBuyRate - context.bcvRate) / context.bcvRate) * 100
      : 0;
  const profitability: Profitability =
    roiPct > PROFITABILITY_GREEN_MIN_PCT
      ? 'green'
      : roiPct > PROFITABILITY_YELLOW_MIN_PCT
        ? 'yellow'
        : 'red';

  return {
    amountBs: totalCostBs,
    netForPurchaseBs: base.baseBs,
    cardCommissionUsd,
    cardCommissionBs,
    usdForBinance,
    binancePercentFeeUsd,
    binanceFixedFeeUsd,
    binanceFixedDiscountBs,
    binanceFeeUsd,
    usdDeposited,
    usdtNet,
    interbankCostBs,
    igtfCostBs,
    igtfCostUsd,
    binanceEffectiveRate,
    grossSaleBs,
    bsOut,
    totalCostBs,
    netProfitBs,
    roiPct,
    effectiveBuyRate,
    breakEvenRate: effectiveBuyRate,
    minGapPct,
    profitability,
  };
}

function createWaterfall(
  context: CalculationContext,
  result: BaseAmounts & DownstreamAmounts,
): WaterfallLine[] {
  const { profile, options } = context;
  const lines: WaterfallLine[] = [
    {
      key: 'investment',
      label: 'Inversión total',
      amountBs: result.amountBs,
      amountUsd: null,
      kind: 'input',
    },
    {
      key: 'net-purchase',
      label: 'Base BCV (USD adjudicados × tasa BCV)',
      amountBs: result.baseBs,
      amountUsd: null,
      kind: 'subtotal',
    },
    {
      key: 'intervention',
      label: 'Comisión por intervención (0,50%)',
      amountBs: -result.interventionFeeBs,
      amountUsd: null,
      kind: 'cost',
    },
  ];

  if (options.interbankEnabled) {
    lines.push({
      key: 'interbank',
      label: `Costo interbancario (${formatPctLabel(profile.interbankPct)})`,
      amountBs: -result.interbankCostBs,
      amountUsd: null,
      kind: 'cost',
    });
  }

  lines.push({
    key: 'card-commission',
    label: `Comisión de tarjeta (${formatPctLabel(profile.cardCommissionPct)})`,
    amountBs: profile.cardCommissionBase === 'ves' ? -result.cardCommissionBs : null,
    amountUsd: profile.cardCommissionBase === 'usd' ? -result.cardCommissionUsd : null,
    kind: 'cost',
    detail:
      profile.cardCommissionBase === 'usd'
        ? 'Descontada de los USD'
        : 'Cobrada extra en Bs.S',
  });

  if (options.igtfEnabled) {
    lines.push({
      key: 'igtf',
      label: `IGTF (${formatPctLabel(profile.igtfPct)})`,
      amountBs: result.igtfCostUsd > 0 ? null : -result.igtfCostBs,
      amountUsd: result.igtfCostUsd > 0 ? -result.igtfCostUsd : null,
      kind: 'cost',
      detail:
        result.igtfCostUsd > 0
          ? 'Cobrada en USD sobre la tarjeta'
          : 'Cobrada en Bs.S',
    });
  }

  lines.push(
    {
      key: 'usd-bought',
      label: 'USD adjudicados en banco',
      amountBs: null,
      amountUsd: result.usdBought,
      kind: 'subtotal',
    },
    {
      key: 'usd-for-binance',
      label: 'USD a ingresar en Binance',
      amountBs: null,
      amountUsd: result.usdForBinance,
      kind: 'subtotal',
    },
    {
      key: 'binance-deposit',
      label: `Comisión Binance (${formatPctLabel(profile.binanceDepositPct)})`,
      amountBs: null,
      amountUsd: -result.binancePercentFeeUsd,
      kind: 'cost',
    },
    {
      key: 'usdt-net',
      label: 'USDT tras comisión % de Binance',
      amountBs: null,
      amountUsd: result.usdDeposited,
      kind: 'subtotal',
    },
  );

  if (result.binanceFixedFeeUsd > 0) {
    lines.push({
      key: 'binance-fixed',
      label: `Comisión fija P2P (${formatNumberLabel(result.binanceFixedFeeUsd)} USDT)`,
      amountBs: -result.binanceFixedDiscountBs,
      amountUsd: -(result.usdDeposited - result.usdtNet),
      kind: 'cost',
      detail: 'Valorada a la tasa efectiva de venta, no a BCV',
    });
  }

  lines.push(
    {
      key: 'usdt-sale-net',
      label: 'USDT netos para la venta',
      amountBs: null,
      amountUsd: result.usdtNet,
      kind: 'subtotal',
    },
  );

  if (options.slippageEnabled) {
    lines.push({
      key: 'slippage',
      label: `Slippage (${formatPctLabel(profile.slippagePct)})`,
      amountBs: null,
      amountUsd: null,
      kind: 'info',
      detail: 'La tasa Binance efectiva ya incluye el deslizamiento',
    });
  }

  lines.push(
    {
      key: 'gross-sale',
      label: 'Venta bruta P2P',
      amountBs: result.grossSaleBs,
      amountUsd: null,
      kind: 'subtotal',
    },
    {
      key: 'bs-out',
      label: 'Retorno neto al vender',
      amountBs: result.bsOut,
      amountUsd: null,
      kind: 'output',
    },
    {
      key: 'total-cost',
      label: 'Costo total real',
      amountBs: result.totalCostBs,
      amountUsd: null,
      kind: 'info',
    },
    {
      key: 'net-profit',
      label: 'Utilidad neta',
      amountBs: result.netProfitBs,
      amountUsd: null,
      kind: 'output',
    },
  );

  return lines;
}

function contextFromInput(input: CalculationInput): CalculationContext {
  return {
    bcvRate: input.bcvRate,
    binanceRate: input.binanceRate,
    profile: input.profile,
    options: input.options,
  };
}

function contextFromSnapshot(snapshot: CalculationSnapshot): CalculationContext {
  return {
    bcvRate: snapshot.bcvRate,
    binanceRate: snapshot.binanceRate,
    profile: {
      cardCommissionPct: snapshot.cardCommissionPct,
      cardCommissionBase: snapshot.cardCommissionBase,
      binanceDepositPct: snapshot.binanceDepositPct,
      binanceDepositFixedUsd: snapshot.binanceDepositFixedUsd,
      interbankPct: snapshot.interbankPct,
      interbankBase: snapshot.interbankBase,
      igtfPct: snapshot.igtfPct,
      igtfBase: snapshot.igtfBase,
      slippagePct: snapshot.slippagePct,
    },
    options: {
      interbankEnabled: snapshot.interbankEnabled,
      igtfEnabled: snapshot.igtfEnabled,
      slippageEnabled: snapshot.slippageEnabled,
    },
  };
}

export function calculate(input: CalculationInput): CalculationResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto debe ser mayor que 0');
  }
  if (!Number.isFinite(input.bcvRate) || input.bcvRate <= 0) {
    throw new Error('La tasa BCV debe ser mayor que 0');
  }
  if (!Number.isFinite(input.binanceRate) || input.binanceRate <= 0) {
    throw new Error('La tasa Binance debe ser mayor que 0');
  }

  const context = contextFromInput(input);
  const base =
    input.mode === 'usd'
      ? baseFromUsd(round2(input.amount), input.bcvRate)
      : solveBaseForTotal(round2(input.amount), context);
  const downstream = calculateDownstream(base, context);

  if (input.mode === 'bs') {
    // The entered Bs.S amount is the total real disbursement. If cent rounding
    // makes that exact total unreachable, keep the closest fee breakdown but
    // anchor the total (and every derived metric) to the entered amount.
    const targetTotal = round2(input.amount);
    if (downstream.amountBs !== targetTotal) {
      const netProfitBs = round2(downstream.bsOut - targetTotal);
      const roiPct = targetTotal > 0 ? (netProfitBs / targetTotal) * 100 : 0;
      const slippageFraction = input.options.slippageEnabled
        ? input.profile.slippagePct / 100
        : 0;
      const effectiveBuyRate =
        downstream.usdtNet > 0
          ? targetTotal / downstream.usdtNet / (1 - slippageFraction)
          : 0;
      downstream.amountBs = targetTotal;
      downstream.totalCostBs = targetTotal;
      downstream.netProfitBs = netProfitBs;
      downstream.roiPct = roiPct;
      downstream.effectiveBuyRate = effectiveBuyRate;
      downstream.breakEvenRate = effectiveBuyRate;
      downstream.minGapPct =
        input.bcvRate > 0
          ? ((effectiveBuyRate - input.bcvRate) / input.bcvRate) * 100
          : 0;
      downstream.profitability =
        roiPct > PROFITABILITY_GREEN_MIN_PCT
          ? 'green'
          : roiPct > PROFITABILITY_YELLOW_MIN_PCT
            ? 'yellow'
            : 'red';
    }
  }

  const snapshot: CalculationSnapshot = {
    profileId: input.profile.id,
    profileName: input.profile.name,
    mode: input.mode,
    inputAmount: input.amount,
    amountBs: downstream.amountBs,
    netForPurchaseBs: downstream.netForPurchaseBs,
    baseBs: base.baseBs,
    bcvPurchaseBs: base.bcvPurchaseBs,
    bcvRate: input.bcvRate,
    binanceRate: input.binanceRate,
    interventionPct: INTERVENTION_PCT,
    interventionFeeBs: base.interventionFeeBs,
    cardCommissionPct: input.profile.cardCommissionPct,
    cardCommissionBase: input.profile.cardCommissionBase,
    cardCommissionUsd: downstream.cardCommissionUsd,
    cardCommissionBs: downstream.cardCommissionBs,
    binanceDepositPct: input.profile.binanceDepositPct,
    binanceDepositFixedUsd: downstream.binanceFixedFeeUsd,
    binanceDepositUsd: downstream.binancePercentFeeUsd,
    binancePercentFeeUsd: downstream.binancePercentFeeUsd,
    binanceFixedDiscountBs: downstream.binanceFixedDiscountBs,
    interbankEnabled: input.options.interbankEnabled,
    interbankPct: input.profile.interbankPct,
    interbankBase: input.profile.interbankBase,
    interbankCostBs: downstream.interbankCostBs,
    igtfEnabled: input.options.igtfEnabled,
    igtfPct: input.profile.igtfPct,
    igtfBase: input.profile.igtfBase,
    igtfCostBs: downstream.igtfCostBs,
    igtfCostUsd: downstream.igtfCostUsd,
    slippageEnabled: input.options.slippageEnabled,
    slippagePct: input.profile.slippagePct,
    usdtNet: downstream.usdtNet,
    effectiveBuyRate: downstream.effectiveBuyRate,
  };

  const result: CalculationResult = {
    mode: input.mode,
    inputAmount: input.amount,
    ...base,
    ...downstream,
    snapshot,
    waterfall: [],
  };
  result.waterfall = createWaterfall(context, result);

  return result;
}

/**
 * Recalculates the executed flow from the USD actually approved by the bank.
 * The original request and the saved snapshot stay immutable.
 */
export function recalculateAccreditation(
  purchase: Pick<PurchaseRecord, 'requestedInvestmentVes' | 'requestedUsd' | 'snapshot'>,
  accreditedUsd: number,
  keepInterbankSunk: boolean,
): AccreditationResult {
  const requestedUsd = round2(purchase.requestedUsd);
  const normalizedAccreditedUsd = round2(accreditedUsd);

  if (!Number.isFinite(normalizedAccreditedUsd) || normalizedAccreditedUsd <= 0) {
    throw new Error('Los USD acreditados deben ser mayores que 0');
  }
  if (normalizedAccreditedUsd > requestedUsd) {
    throw new Error('Los USD acreditados no pueden superar los USD solicitados');
  }

  const isTotal = normalizedAccreditedUsd === requestedUsd;
  const context = contextFromSnapshot(purchase.snapshot);

  // The snapshot's netForPurchaseBs is the original Base_Bs. For total
  // accreditation, using it reproduces the initial waterfall exactly.
  const base =
    isTotal && purchase.snapshot.netForPurchaseBs > 0
      ? baseFromBaseBs(purchase.snapshot.netForPurchaseBs, purchase.snapshot.bcvRate)
      : baseFromUsd(normalizedAccreditedUsd, purchase.snapshot.bcvRate);

  const effectiveKeepInterbankSunk =
    !isTotal && purchase.snapshot.interbankEnabled && keepInterbankSunk;
  const downstream = calculateDownstream(
    base,
    context,
    effectiveKeepInterbankSunk ? purchase.snapshot.interbankCostBs : undefined,
  );
  const requestedInvestment = round2(purchase.requestedInvestmentVes);
  const refundedVes = Math.max(0, round2(requestedInvestment - downstream.amountBs));
  const accreditationRatePercent = (normalizedAccreditedUsd / requestedUsd) * 100;

  const result: AccreditationResult = {
    ...base,
    ...downstream,
    accreditedUsd: normalizedAccreditedUsd,
    accreditationType: isTotal ? 'TOTAL' : 'PARTIAL',
    accreditationRatePercent,
    refundedVes,
    keepInterbankSunk: effectiveKeepInterbankSunk,
    waterfall: [],
  };
  result.waterfall = createWaterfall(context, result);

  return result;
}

export interface FifoInventoryResult {
  purchases: PurchaseRecord[];
  sales: SaleRecord[];
}

export interface FifoSalePreview extends FifoInventoryResult {
  preview: SaleRecord;
}

const BINANCE_INVENTORY_STATUSES: PurchaseStatus[] = [
  'deposited_binance',
  'partial',
  'completed',
];

function hasBinanceInventory(purchase: PurchaseRecord): boolean {
  return (
    BINANCE_INVENTORY_STATUSES.includes(purchase.status) &&
    Math.max(purchase.initialBinanceUsdt ?? 0, purchase.usdDeposited ?? 0) > 0
  );
}

function inventoryInitialUsdt(purchase: PurchaseRecord): number {
  if ((purchase.initialBinanceUsdt ?? 0) > 0) {
    return round2(Math.max(0, purchase.initialBinanceUsdt as number));
  }

  return round2(Math.max(0, purchase.usdDeposited ?? 0));
}

function inventoryExecutedCostVes(purchase: PurchaseRecord): number {
  return round2(
    Math.max(
      0,
      purchase.executedTotalCostVes ??
        purchase.totalCostBs ??
        purchase.amountBs ??
        purchase.requestedInvestmentVes ??
        0,
    ),
  );
}

function fundedTimestamp(purchase: PurchaseRecord): string {
  return purchase.fundedToBinanceAt ?? purchase.createdAt;
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resets a purchase to its inventory baseline before replaying sales. Dates are
 * kept stable so the FIFO order is deterministic. Legacy fully-completed
 * purchases without allocations remain closed and are not reopened by a sale.
 */
function prepareInventoryPurchase(purchase: PurchaseRecord): PurchaseRecord {
  const requestedTotalCostVes = round2(
    purchase.requestedTotalCostVes ??
      purchase.requestedInvestmentVes ??
      purchase.amountBs ??
      0,
  );
  const executedTotalCostVes = inventoryExecutedCostVes(purchase);
  const initialUsdt = inventoryInitialUsdt(purchase);
  const unitCostInBinanceVes =
    initialUsdt > 0 ? round2(executedTotalCostVes / initialUsdt) : 0;
  const fundedToBinanceAt = hasBinanceInventory(purchase)
    ? fundedTimestamp(purchase)
    : null;
  const hasAllocations = (purchase.allocations?.length ?? 0) > 0;
  const legacyClosed =
    purchase.status === 'completed' && !hasAllocations && initialUsdt > 0;

  if (legacyClosed) {
    const soldUsdt = round2(Math.min(initialUsdt, purchase.soldUsdt ?? initialUsdt));
    const realizedRevenueVes = round2(
      purchase.realizedRevenueVes ??
        purchase.execution?.executedBsOut ??
        purchase.estimatedBsOut ??
        0,
    );
    const realizedProfitVes = round2(
      purchase.realizedProfitVes ??
        purchase.execution?.executedProfitBs ??
        purchase.estimatedProfitBs ??
        0,
    );

    return {
      ...purchase,
      requestedTotalCostVes,
      executedTotalCostVes,
      fundedToBinanceAt,
      initialBinanceUsdt: initialUsdt,
      unitCostInBinanceVes,
      soldUsdt,
      remainingBinanceUsdt: 0,
      allocatedCostVesTotal: executedTotalCostVes,
      remainingCostVes: 0,
      realizedRevenueVes,
      realizedProfitVes,
      weightedAverageSellRateVes: round2(
        purchase.weightedAverageSellRateVes ??
          purchase.execution?.realBinanceRate ??
          0,
      ),
      allocations: [],
    };
  }

  if (hasBinanceInventory(purchase) && initialUsdt > 0) {
    return {
      ...purchase,
      requestedTotalCostVes,
      executedTotalCostVes,
      fundedToBinanceAt,
      initialBinanceUsdt: initialUsdt,
      unitCostInBinanceVes,
      soldUsdt: 0,
      remainingBinanceUsdt: initialUsdt,
      allocatedCostVesTotal: 0,
      remainingCostVes: executedTotalCostVes,
      realizedRevenueVes: 0,
      realizedProfitVes: 0,
      weightedAverageSellRateVes: 0,
      allocations: [],
      status: 'deposited_binance',
    };
  }

  return {
    ...purchase,
    requestedTotalCostVes,
    executedTotalCostVes,
    fundedToBinanceAt,
    initialBinanceUsdt: 0,
    unitCostInBinanceVes: 0,
    soldUsdt: 0,
    remainingBinanceUsdt: 0,
    allocatedCostVesTotal: 0,
    remainingCostVes: 0,
    realizedRevenueVes: 0,
    realizedProfitVes: 0,
    weightedAverageSellRateVes: 0,
    allocations: [],
  };
}

function sortEligibleLots(purchases: PurchaseRecord[]): PurchaseRecord[] {
  return purchases
    .filter(
      (purchase) =>
        (purchase.status === 'deposited_binance' || purchase.status === 'partial') &&
        (purchase.remainingBinanceUsdt ?? 0) > 0,
    )
    .sort((left, right) => {
      const fundedDifference =
        timestampValue(fundedTimestamp(left)) - timestampValue(fundedTimestamp(right));
      if (fundedDifference !== 0) return fundedDifference;

      const createdDifference =
        timestampValue(left.createdAt) - timestampValue(right.createdAt);
      if (createdDifference !== 0) return createdDifference;

      return left.id.localeCompare(right.id);
    });
}

function saleSort(left: SaleRecord, right: SaleRecord): number {
  const difference =
    timestampValue(left.createdAt) - timestampValue(right.createdAt);
  return difference !== 0 ? difference : left.id.localeCompare(right.id);
}

/**
 * Rebuilds the Binance inventory and every FIFO allocation from the original
 * purchases and the sale journal. The function is pure: it never mutates its
 * arguments and always returns new arrays/objects.
 */
export function reconcileFifoInventory(
  purchases: PurchaseRecord[],
  sales: SaleRecord[],
): FifoInventoryResult {
  const reconciledPurchases = purchases.map(prepareInventoryPurchase);
  const orderedSales = [...sales].sort(saleSort);
  const processedSales: SaleRecord[] = [];

  for (const sale of orderedSales) {
    const totalUsdtSold = round2(sale.totalUsdtSold);
    const p2pFixedFeeUsdt = round2(
      sale.p2pFixedFeeUsdt ?? DEFAULT_P2P_FIXED_FEE_USDT,
    );
    const sellRateVes = sale.sellRateVes;

    if (!Number.isFinite(totalUsdtSold) || totalUsdtSold <= 0) {
      throw new Error('El monto de la venta debe ser mayor que 0');
    }
    if (!Number.isFinite(sellRateVes) || sellRateVes <= 0) {
      throw new Error('La tasa de venta debe ser mayor que 0');
    }
    if (!Number.isFinite(p2pFixedFeeUsdt) || p2pFixedFeeUsdt < 0) {
      throw new Error('La comisión fija P2P no puede ser negativa');
    }
    if (p2pFixedFeeUsdt >= totalUsdtSold) {
      throw new Error('La comisión fija P2P debe ser menor que el monto vendido');
    }

    const eligibleLots = sortEligibleLots(reconciledPurchases);
    const availableUsdt = round2(
      eligibleLots.reduce(
        (total, purchase) => total + (purchase.remainingBinanceUsdt ?? 0),
        0,
      ),
    );

    if (availableUsdt < totalUsdtSold) {
      throw new Error(
        `Saldo insuficiente en Binance: disponible ${availableUsdt.toFixed(2)} USDT`,
      );
    }

    let neededUsdt = totalUsdtSold;
    const consumed: Array<{
      purchase: PurchaseRecord;
      usdtTaken: number;
      allocatedCostVes: number;
    }> = [];

    while (neededUsdt > 0.0000001) {
      const lot = eligibleLots.find(
        (purchase) => (purchase.remainingBinanceUsdt ?? 0) > 0,
      );
      if (!lot) {
        throw new Error('Saldo insuficiente en Binance para completar la venta');
      }

      const previousRemaining = round2(lot.remainingBinanceUsdt ?? 0);
      const previousCost = round2(lot.remainingCostVes ?? 0);
      const usdtTaken = round2(Math.min(previousRemaining, neededUsdt));
      if (usdtTaken <= 0) {
        throw new Error('El monto de la venta no puede consumir un lote con saldo cero');
      }

      lot.remainingBinanceUsdt = round2(previousRemaining - usdtTaken);
      lot.soldUsdt = round2((lot.soldUsdt ?? 0) + usdtTaken);
      const allocatedCostVes =
        lot.remainingBinanceUsdt === 0
          ? previousCost
          : round2(previousCost * (usdtTaken / previousRemaining));
      lot.allocatedCostVesTotal = round2(
        (lot.allocatedCostVesTotal ?? 0) + allocatedCostVes,
      );
      lot.remainingCostVes =
        lot.remainingBinanceUsdt === 0
          ? 0
          : round2(previousCost - allocatedCostVes);
      lot.status =
        lot.remainingBinanceUsdt === 0 ? 'completed' : 'partial';

      consumed.push({ purchase: lot, usdtTaken, allocatedCostVes });
      neededUsdt = round2(neededUsdt - usdtTaken);
    }

    const totalVesReceived = round2(
      (totalUsdtSold - p2pFixedFeeUsdt) * sellRateVes,
    );
    let allocatedRevenue = 0;
    let allocatedFee = 0;
    const allocations: SaleLotAllocation[] = [];

    consumed.forEach((part, index) => {
      const isLast = index === consumed.length - 1;
      const weight = part.usdtTaken / totalUsdtSold;
      const p2pFeeShareUsdt = isLast
        ? round2(p2pFixedFeeUsdt - allocatedFee)
        : round2(p2pFixedFeeUsdt * weight);
      const allocatedRevenueVes = isLast
        ? round2(totalVesReceived - allocatedRevenue)
        : round2(totalVesReceived * weight);
      const netUsdtSold = round2(part.usdtTaken - p2pFeeShareUsdt);
      const allocatedProfitVes = round2(
        allocatedRevenueVes - part.allocatedCostVes,
      );
      const allocatedRoiPercent =
        part.allocatedCostVes > 0
          ? (allocatedProfitVes / part.allocatedCostVes) * 100
          : 0;
      const allocation: SaleLotAllocation = {
        allocationId: `${sale.id}:${part.purchase.id}`,
        saleId: sale.id,
        purchaseId: part.purchase.id,
        allocatedAt: sale.createdAt,
        usdtTaken: part.usdtTaken,
        p2pFeeShareUsdt,
        netUsdtSold,
        sellRateVes,
        allocatedCostVes: part.allocatedCostVes,
        allocatedRevenueVes,
        allocatedProfitVes,
        allocatedRoiPercent,
        lotRemainingUsdtAfter: part.purchase.remainingBinanceUsdt ?? 0,
      };

      part.purchase.allocations = [
        ...(part.purchase.allocations ?? []),
        allocation,
      ];
      part.purchase.realizedRevenueVes = round2(
        (part.purchase.realizedRevenueVes ?? 0) + allocatedRevenueVes,
      );
      part.purchase.realizedProfitVes = round2(
        (part.purchase.realizedProfitVes ?? 0) + allocatedProfitVes,
      );
      const soldUsdt = round2(part.purchase.soldUsdt ?? 0);
      const weightedValue =
        soldUsdt > 0
          ? (part.purchase.allocations ?? []).reduce(
              (total, item) => total + item.usdtTaken * item.sellRateVes,
              0,
            ) / soldUsdt
          : 0;
      part.purchase.weightedAverageSellRateVes = round2(weightedValue);
      allocations.push(allocation);
      allocatedRevenue = round2(allocatedRevenue + allocatedRevenueVes);
      allocatedFee = round2(allocatedFee + p2pFeeShareUsdt);
    });

    const totalAllocatedCostVes = round2(
      allocations.reduce((total, allocation) => total + allocation.allocatedCostVes, 0),
    );
    const totalRealizedProfitVes = round2(
      totalVesReceived - totalAllocatedCostVes,
    );
    const realizedRoiPercent =
      totalAllocatedCostVes > 0
        ? (totalRealizedProfitVes / totalAllocatedCostVes) * 100
        : 0;
    const walletBalanceAfterUsdt = round2(
      reconciledPurchases.reduce(
        (total, purchase) => total + (purchase.remainingBinanceUsdt ?? 0),
        0,
      ),
    );

    processedSales.push({
      ...sale,
      totalUsdtSold,
      p2pFixedFeeUsdt,
      netUsdtLiquidated: round2(totalUsdtSold - p2pFixedFeeUsdt),
      sellRateVes,
      totalVesReceived,
      totalAllocatedCostVes,
      totalRealizedProfitVes,
      realizedRoiPercent,
      walletBalanceAfterUsdt,
      allocations,
    });
  }

  return { purchases: reconciledPurchases, sales: processedSales };
}

/** Builds a non-persisted synthetic sale to preview FIFO consumption in the UI. */
export function previewFifoSale(
  purchases: PurchaseRecord[],
  sales: SaleRecord[],
  input: SaleInput,
): FifoSalePreview {
  const latestSaleTimestamp = sales.reduce(
    (latest, sale) => Math.max(latest, timestampValue(sale.createdAt)),
    0,
  );
  const createdAt = new Date(
    Math.max(Date.now(), latestSaleTimestamp + 1),
  ).toISOString();
  const draft: SaleRecord = {
    id: '__preview__',
    createdAt,
    notes: input.notes ?? '',
    totalUsdtSold: input.totalUsdtSold,
    p2pFixedFeeUsdt: input.p2pFixedFeeUsdt ?? DEFAULT_P2P_FIXED_FEE_USDT,
    netUsdtLiquidated: 0,
    sellRateVes: input.sellRateVes,
    totalVesReceived: 0,
    totalAllocatedCostVes: 0,
    totalRealizedProfitVes: 0,
    realizedRoiPercent: 0,
    walletBalanceAfterUsdt: 0,
    allocations: [],
  };
  const result = reconcileFifoInventory(purchases, [...sales, draft]);
  const preview = result.sales.find((sale) => sale.id === '__preview__');
  if (!preview) {
    throw new Error('No fue posible simular la venta FIFO');
  }

  return { ...result, preview };
}
