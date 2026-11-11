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
  Profitability,
  PurchaseRecord,
  WaterfallLine,
} from './types';

export const INTERVENTION_PCT = 0.5;
export const PROFITABILITY_GREEN_MIN_PCT = 3;
export const PROFITABILITY_YELLOW_MIN_PCT = 0;
export const ABNORMAL_GAP_PCT = 50;

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

interface CalculationBase {
  amountBs: number;
  interventionFeeBs: number;
  netForPurchaseBs: number;
  usdBought: number;
}

interface DownstreamAmounts {
  cardCommissionUsd: number;
  cardCommissionBs: number;
  usdForBinance: number;
  binanceFeeUsd: number;
  usdDeposited: number;
  interbankCostBs: number;
  igtfCostBs: number;
  binanceEffectiveRate: number;
  bsOut: number;
  totalCostBs: number;
  netProfitBs: number;
  roiPct: number;
  breakEvenRate: number;
  minGapPct: number;
  profitability: Profitability;
}

export interface AccreditationResult extends CalculationBase, DownstreamAmounts {
  accreditedUsd: number;
  accreditationType: AccreditationType;
  accreditationRatePercent: number;
  /** Bs.S released back to the current account. */
  refundedVes: number;
  keepInterbankSunk: boolean;
  waterfall: WaterfallLine[];
}

interface WaterfallSource {
  amountBs: number;
  interventionFeeBs: number;
  netForPurchaseBs: number;
  usdBought: number;
  cardCommissionUsd: number;
  cardCommissionBs: number;
  usdForBinance: number;
  binanceFeeUsd: number;
  usdDeposited: number;
  interbankCostBs: number;
  igtfCostBs: number;
  bsOut: number;
  totalCostBs: number;
  netProfitBs: number;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Number(`${Math.round(Number(`${Math.abs(value)}e2`))}e-2`);
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

function createWaterfall(
  context: CalculationContext,
  result: WaterfallSource,
): WaterfallLine[] {
  const { profile, options } = context;
  const lines: WaterfallLine[] = [
    {
      key: 'investment',
      label: 'Inversión inicial',
      amountBs: result.amountBs,
      amountUsd: null,
      kind: 'input',
    },
    {
      key: 'intervention',
      label: 'Comisión por intervención (0,50%)',
      amountBs: -result.interventionFeeBs,
      amountUsd: null,
      kind: 'cost',
    },
    {
      key: 'net-purchase',
      label: 'Neto para compra de divisas',
      amountBs: result.netForPurchaseBs,
      amountUsd: null,
      kind: 'subtotal',
    },
    {
      key: 'usd-bought',
      label: 'USD acreditados en banco',
      amountBs: null,
      amountUsd: result.usdBought,
      kind: 'subtotal',
    },
    {
      key: 'card-commission',
      label: `Comisión de tarjeta (${formatPctLabel(profile.cardCommissionPct)})`,
      amountBs: profile.cardCommissionBase === 'ves' ? -result.cardCommissionBs : null,
      amountUsd: profile.cardCommissionBase === 'usd' ? -result.cardCommissionUsd : null,
      kind: 'cost',
      detail:
        profile.cardCommissionBase === 'usd'
          ? 'Descontada de los USD'
          : 'Cobrada extra en Bs.S',
    },
    {
      key: 'usd-for-binance',
      label: 'USD exactos para Binance',
      amountBs: null,
      amountUsd: result.usdForBinance,
      kind: 'subtotal',
    },
    {
      key: 'binance-deposit',
      label: `Comisión Binance (${formatPctLabel(profile.binanceDepositPct)} + ${formatNumberLabel(profile.binanceDepositFixedUsd)} USD)`,
      amountBs: null,
      amountUsd: -result.binanceFeeUsd,
      kind: 'cost',
    },
    {
      key: 'usdt-net',
      label: 'USDT netos en billetera',
      amountBs: null,
      amountUsd: result.usdDeposited,
      kind: 'subtotal',
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

  if (options.igtfEnabled) {
    lines.push({
      key: 'igtf',
      label: `IGTF (${formatPctLabel(profile.igtfPct)})`,
      amountBs: -result.igtfCostBs,
      amountUsd: null,
      kind: 'cost',
    });
  }

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
      key: 'bs-out',
      label: 'Retorno bruto al vender',
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

function calculateDownstream(
  base: CalculationBase,
  context: CalculationContext,
  sunkInterbankCostBs?: number,
): DownstreamAmounts {
  const { profile, options } = context;
  let cardCommissionUsd: number;
  let cardCommissionBs: number;
  let usdForBinance: number;

  if (profile.cardCommissionBase === 'usd') {
    // Gross-up: the card fee is charged over the amount that actually reaches
    // Binance, so the deposit is USD_1 / (1 + pct/100) and the retained fee is
    // the difference. This matches bank cuts on the deposited amount.
    usdForBinance = round2(base.usdBought / (1 + profile.cardCommissionPct / 100));
    cardCommissionUsd = round2(base.usdBought - usdForBinance);
    cardCommissionBs = round2(cardCommissionUsd * context.bcvRate);
  } else {
    cardCommissionBs = round2(base.netForPurchaseBs * (profile.cardCommissionPct / 100));
    cardCommissionUsd = round2(cardCommissionBs / context.bcvRate);
    usdForBinance = base.usdBought;
  }

  const binanceFeeUsd = round2(
    usdForBinance * (profile.binanceDepositPct / 100) + profile.binanceDepositFixedUsd,
  );
  const usdDeposited = round2(usdForBinance - binanceFeeUsd);
  if (usdDeposited <= 0) {
    throw new Error('Las comisiones superan los USD disponibles para operar');
  }

  const interbankCostBs = options.interbankEnabled
    ? sunkInterbankCostBs !== undefined
      ? round2(sunkInterbankCostBs)
      : round2(
          (profile.interbankBase === 'initial' ? base.amountBs : base.netForPurchaseBs) *
            (profile.interbankPct / 100),
        )
    : 0;
  const igtfCostBs = options.igtfEnabled
    ? round2(
        (profile.igtfBase === 'card' ? cardCommissionBs : base.amountBs) *
          (profile.igtfPct / 100),
      )
    : 0;
  const binanceEffectiveRate = options.slippageEnabled
    ? context.binanceRate * (1 - profile.slippagePct / 100)
    : context.binanceRate;
  const bsOut = round2(usdDeposited * binanceEffectiveRate);
  const totalCostBs = round2(
    base.amountBs +
      interbankCostBs +
      (profile.cardCommissionBase === 'ves' ? cardCommissionBs : 0) +
      igtfCostBs,
  );
  const netProfitBs = round2(bsOut - totalCostBs);
  const roiPct = totalCostBs > 0 ? (netProfitBs / totalCostBs) * 100 : 0;
  const breakEvenRate = totalCostBs / usdDeposited;
  const minGapPct = ((breakEvenRate - context.bcvRate) / context.bcvRate) * 100;
  const profitability: Profitability =
    roiPct > PROFITABILITY_GREEN_MIN_PCT
      ? 'green'
      : roiPct > PROFITABILITY_YELLOW_MIN_PCT
        ? 'yellow'
        : 'red';

  return {
    cardCommissionUsd,
    cardCommissionBs,
    usdForBinance,
    binanceFeeUsd,
    usdDeposited,
    interbankCostBs,
    igtfCostBs,
    binanceEffectiveRate,
    bsOut,
    totalCostBs,
    netProfitBs,
    roiPct,
    breakEvenRate,
    minGapPct,
    profitability,
  };
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

  let amountBs: number;
  if (input.mode === 'usd') {
    const targetUsd = round2(input.amount);
    const netForPurchaseTargetBs = round2(targetUsd * input.bcvRate);
    amountBs = round2(netForPurchaseTargetBs / (1 - INTERVENTION_PCT / 100));
  } else {
    amountBs = round2(input.amount);
  }

  const interventionFeeBs = round2(amountBs * (INTERVENTION_PCT / 100));
  const netForPurchaseBs = round2(amountBs - interventionFeeBs);
  const usdBought = round2(netForPurchaseBs / input.bcvRate);
  const context = contextFromInput(input);
  const base: CalculationBase = {
    amountBs,
    interventionFeeBs,
    netForPurchaseBs,
    usdBought,
  };
  const downstream = calculateDownstream(base, context);

  const snapshot: CalculationSnapshot = {
    profileId: input.profile.id,
    profileName: input.profile.name,
    mode: input.mode,
    inputAmount: input.amount,
    amountBs,
    bcvRate: input.bcvRate,
    binanceRate: input.binanceRate,
    interventionPct: INTERVENTION_PCT,
    interventionFeeBs,
    netForPurchaseBs,
    cardCommissionPct: input.profile.cardCommissionPct,
    cardCommissionBase: input.profile.cardCommissionBase,
    cardCommissionUsd: downstream.cardCommissionUsd,
    cardCommissionBs: downstream.cardCommissionBs,
    binanceDepositPct: input.profile.binanceDepositPct,
    binanceDepositFixedUsd: input.profile.binanceDepositFixedUsd,
    binanceDepositUsd: downstream.binanceFeeUsd,
    interbankEnabled: input.options.interbankEnabled,
    interbankPct: input.profile.interbankPct,
    interbankBase: input.profile.interbankBase,
    interbankCostBs: downstream.interbankCostBs,
    igtfEnabled: input.options.igtfEnabled,
    igtfPct: input.profile.igtfPct,
    igtfBase: input.profile.igtfBase,
    igtfCostBs: downstream.igtfCostBs,
    slippageEnabled: input.options.slippageEnabled,
    slippagePct: input.profile.slippagePct,
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
  const base: CalculationBase = isTotal
    ? {
        amountBs: round2(purchase.requestedInvestmentVes),
        interventionFeeBs: purchase.snapshot.interventionFeeBs,
        netForPurchaseBs: purchase.snapshot.netForPurchaseBs,
        usdBought: requestedUsd,
      }
    : (() => {
        const netForPurchaseBs = round2(normalizedAccreditedUsd * purchase.snapshot.bcvRate);
        const executedAmountBs = round2(
          netForPurchaseBs / (1 - INTERVENTION_PCT / 100),
        );
        return {
          amountBs: executedAmountBs,
          interventionFeeBs: round2(executedAmountBs - netForPurchaseBs),
          netForPurchaseBs,
          usdBought: normalizedAccreditedUsd,
        };
      })();

  const effectiveKeepInterbankSunk =
    purchase.snapshot.interbankEnabled && keepInterbankSunk;
  const downstream = calculateDownstream(
    base,
    context,
    effectiveKeepInterbankSunk ? purchase.snapshot.interbankCostBs : undefined,
  );
  const refundedVes = Math.max(
    0,
    round2(round2(purchase.requestedInvestmentVes) - base.amountBs),
  );
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
