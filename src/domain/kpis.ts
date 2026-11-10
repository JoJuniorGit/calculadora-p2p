import type { PurchaseKpis, PurchaseRecord } from './types';
import { round2 } from './calculations';

export function computeKpis(purchases: PurchaseRecord[]): PurchaseKpis {
  let inTransitCapitalTotal = 0;
  let inTransitCount = 0;
  let completedProfitTotal = 0;
  let completedCostTotal = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  for (const purchase of purchases) {
    switch (purchase.status) {
      case 'pending':
      case 'usd_credited':
      case 'deposited_binance':
        inTransitCapitalTotal += purchase.totalCostBs;
        inTransitCount += 1;
        break;
      case 'completed':
        completedProfitTotal +=
          purchase.execution?.executedProfitBs ?? purchase.estimatedProfitBs;
        completedCostTotal += purchase.totalCostBs;
        completedCount += 1;
        break;
      case 'cancelled':
        cancelledCount += 1;
        break;
    }
  }

  const inTransitCapitalBs = round2(inTransitCapitalTotal);
  const completedProfitBs = round2(completedProfitTotal);
  const completedCostBs = round2(completedCostTotal);
  const weightedRoiPct =
    completedCostBs > 0 ? (completedProfitBs / completedCostBs) * 100 : 0;

  return {
    inTransitCapitalBs,
    inTransitCount,
    completedProfitBs,
    completedCostBs,
    weightedRoiPct,
    completedCount,
    cancelledCount,
  };
}
