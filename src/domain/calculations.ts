import type {
  CalculationInput,
  CalculationResult,
  CalculationSnapshot,
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

function createWaterfall(input: CalculationInput, result: CalculationResult): WaterfallLine[] {
  const { profile } = input;
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

  if (input.options.interbankEnabled) {
    lines.push({
      key: 'interbank',
      label: `Costo interbancario (${formatPctLabel(profile.interbankPct)})`,
      amountBs: -result.interbankCostBs,
      amountUsd: null,
      kind: 'cost',
    });
  }

  if (input.options.igtfEnabled) {
    lines.push({
      key: 'igtf',
      label: `IGTF (${formatPctLabel(profile.igtfPct)})`,
      amountBs: -result.igtfCostBs,
      amountUsd: null,
      kind: 'cost',
    });
  }

  if (input.options.slippageEnabled) {
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

  let cardCommissionUsd: number;
  let cardCommissionBs: number;
  let usdForBinance: number;
  if (input.profile.cardCommissionBase === 'usd') {
    cardCommissionUsd = round2(usdBought * (input.profile.cardCommissionPct / 100));
    usdForBinance = round2(usdBought - cardCommissionUsd);
    cardCommissionBs = round2(cardCommissionUsd * input.bcvRate);
  } else {
    cardCommissionBs = round2(netForPurchaseBs * (input.profile.cardCommissionPct / 100));
    cardCommissionUsd = round2(cardCommissionBs / input.bcvRate);
    usdForBinance = usdBought;
  }

  const binanceFeeUsd = round2(
    usdForBinance * (input.profile.binanceDepositPct / 100) +
      input.profile.binanceDepositFixedUsd,
  );
  const usdDeposited = round2(usdForBinance - binanceFeeUsd);
  if (usdDeposited <= 0) {
    throw new Error('Las comisiones superan los USD disponibles para operar');
  }

  const interbankCostBs = input.options.interbankEnabled
    ? round2(
        (input.profile.interbankBase === 'initial' ? amountBs : netForPurchaseBs) *
          (input.profile.interbankPct / 100),
      )
    : 0;
  const igtfCostBs = input.options.igtfEnabled
    ? round2(
        (input.profile.igtfBase === 'card' ? cardCommissionBs : amountBs) *
          (input.profile.igtfPct / 100),
      )
    : 0;
  const binanceEffectiveRate = input.options.slippageEnabled
    ? input.binanceRate * (1 - input.profile.slippagePct / 100)
    : input.binanceRate;
  const bsOut = round2(usdDeposited * binanceEffectiveRate);
  const totalCostBs = round2(
    amountBs +
      interbankCostBs +
      (input.profile.cardCommissionBase === 'ves' ? cardCommissionBs : 0) +
      igtfCostBs,
  );
  const netProfitBs = round2(bsOut - totalCostBs);
  const roiPct = totalCostBs > 0 ? (netProfitBs / totalCostBs) * 100 : 0;
  const breakEvenRate = totalCostBs / usdDeposited;
  const minGapPct = ((breakEvenRate - input.bcvRate) / input.bcvRate) * 100;
  const profitability =
    roiPct > PROFITABILITY_GREEN_MIN_PCT
      ? 'green'
      : roiPct > PROFITABILITY_YELLOW_MIN_PCT
        ? 'yellow'
        : 'red';

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
    cardCommissionUsd,
    cardCommissionBs,
    binanceDepositPct: input.profile.binanceDepositPct,
    binanceDepositFixedUsd: input.profile.binanceDepositFixedUsd,
    binanceDepositUsd: binanceFeeUsd,
    interbankEnabled: input.options.interbankEnabled,
    interbankPct: input.profile.interbankPct,
    interbankBase: input.profile.interbankBase,
    interbankCostBs,
    igtfEnabled: input.options.igtfEnabled,
    igtfPct: input.profile.igtfPct,
    igtfBase: input.profile.igtfBase,
    igtfCostBs,
    slippageEnabled: input.options.slippageEnabled,
    slippagePct: input.profile.slippagePct,
  };

  const result: CalculationResult = {
    mode: input.mode,
    inputAmount: input.amount,
    amountBs,
    interventionFeeBs,
    netForPurchaseBs,
    usdBought,
    usdForBinance,
    usdDeposited,
    cardCommissionUsd,
    cardCommissionBs,
    binanceFeeUsd,
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
    snapshot,
    waterfall: [],
  };
  result.waterfall = createWaterfall(input, result);

  return result;
}
