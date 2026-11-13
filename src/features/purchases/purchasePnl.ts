import type { PurchaseRecord } from '../../domain/types';
import { formatPct } from '../../utils/format';

interface PurchaseOutcome {
  bsOut: number;
  profitBs: number;
  roiPct: number;
}

function getPurchaseOutcome(purchase: PurchaseRecord): PurchaseOutcome | null {
  if (
    purchase.realizedRevenueVes !== undefined &&
    (purchase.status === 'completed' ||
      purchase.status === 'partial' ||
      (purchase.soldUsdt ?? 0) > 0)
  ) {
    const allocatedCost = purchase.allocatedCostVesTotal ?? 0;
    return {
      bsOut: purchase.realizedRevenueVes,
      profitBs: purchase.realizedProfitVes ?? 0,
      roiPct:
        allocatedCost > 0
          ? ((purchase.realizedProfitVes ?? 0) / allocatedCost) * 100
          : 0,
    };
  }

  if (purchase.status === 'completed' && purchase.execution) {
    return {
      bsOut: purchase.execution.executedBsOut,
      profitBs: purchase.execution.executedProfitBs,
      roiPct: purchase.execution.executedRoiPct,
    };
  }

  return null;
}

function getSaleRate(purchase: PurchaseRecord): number {
  if (purchase.execution?.realBinanceRate) return purchase.execution.realBinanceRate;
  if ((purchase.weightedAverageSellRateVes ?? 0) > 0) {
    return purchase.weightedAverageSellRateVes as number;
  }

  const snapshotRate = purchase.snapshot.binanceRate || purchase.binanceRate;
  return purchase.snapshot.slippageEnabled
    ? snapshotRate * (1 - purchase.snapshot.slippagePct / 100)
    : snapshotRate;
}

export type PnlState = 'projected' | 'partial' | 'realized';

export interface PurchasePnl {
  state: PnlState;
  /** Resultado in Bs.S: projected revenue or the realized revenue so far. */
  resultVes: number;
  /** Net profit in Bs.S: projected profit or the realized profit so far. */
  profitVes: number;
  roiPct: number;
  /** USDT net worth selling in Binance, used by the projected result. */
  netUsd?: number;
  soldUsdt?: number;
  totalUsdt?: number;
  /** Share of the lot already sold, used by the partial subtitle. */
  soldPct?: number;
}

export function formatSignedPct(value: number): string {
  const label = formatPct(value);
  return value > 0 ? `+${label}` : label;
}

/** USDT net that reaches the Binance wallet, derived from the purchase snapshot. */
function getProjectedNetUsd(purchase: PurchaseRecord, snapshotRate: number): number {
  const snapshotNet = purchase.snapshot.usdtNet;
  if (typeof snapshotNet === 'number' && snapshotNet > 0) return snapshotNet;
  if (snapshotRate > 0 && purchase.estimatedBsOut > 0) {
    return purchase.estimatedBsOut / snapshotRate;
  }
  return purchase.usdDeposited;
}

/**
 * Floating PnL (projected at the current Binance rate) versus realized PnL
 * (FIFO sales already executed). Cancelled purchases have no PnL at all.
 */
export function getPurchasePnl(
  purchase: PurchaseRecord,
  currentBinanceRate: number,
): PurchasePnl | null {
  if (purchase.status === 'cancelled') return null;

  const outcome = getPurchaseOutcome(purchase);
  if (outcome) {
    const soldUsdt = purchase.soldUsdt ?? 0;
    const totalUsdt = purchase.initialBinanceUsdt ?? purchase.usdDeposited;
    return {
      state: purchase.status === 'completed' ? 'realized' : 'partial',
      resultVes: outcome.bsOut,
      profitVes: outcome.profitBs,
      roiPct: outcome.roiPct,
      soldUsdt,
      totalUsdt,
      soldPct: totalUsdt > 0 ? (soldUsdt / totalUsdt) * 100 : 0,
    };
  }

  const snapshotRate = getSaleRate(purchase);
  const rate = currentBinanceRate > 0 ? currentBinanceRate : snapshotRate;
  const netUsd = getProjectedNetUsd(purchase, snapshotRate);
  const resultVes = netUsd * rate;
  const profitVes = resultVes - purchase.totalCostBs;

  return {
    state: 'projected',
    resultVes,
    profitVes,
    roiPct: purchase.totalCostBs > 0 ? (profitVes / purchase.totalCostBs) * 100 : 0,
    netUsd,
  };
}
