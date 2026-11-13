import type { PurchaseKpis, PurchaseRecord } from './types';
import { round2 } from './calculations';

function purchaseSaleRate(purchase: PurchaseRecord): number {
  if (purchase.execution?.realBinanceRate) return purchase.execution.realBinanceRate;
  if ((purchase.weightedAverageSellRateVes ?? 0) > 0) {
    return purchase.weightedAverageSellRateVes as number;
  }

  const snapshotRate = purchase.snapshot.binanceRate || purchase.binanceRate;
  if (!Number.isFinite(snapshotRate) || snapshotRate <= 0) return 0;
  return purchase.snapshot.slippageEnabled
    ? snapshotRate * (1 - purchase.snapshot.slippagePct / 100)
    : snapshotRate;
}

function toUsd(valueBs: number, rate: number): number {
  return rate > 0 ? valueBs / rate : 0;
}

export function computeKpis(purchases: PurchaseRecord[]): PurchaseKpis {
  let inTransitCapitalTotal = 0;
  let inTransitCount = 0;
  let completedProfitTotal = 0;
  let completedCostTotal = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let capitalInTransitVes = 0;
  let capitalInTransitUsd = 0;
  let capitalInBankVes = 0;
  let capitalInBankUsd = 0;
  let capitalInBinanceVes = 0;
  let capitalInBinanceUsdt = 0;
  let realizedProfitVes = 0;
  let realizedProfitUsdt = 0;
  let realizedCostVes = 0;

  for (const purchase of purchases) {
    switch (purchase.status) {
      case 'pending':
        inTransitCapitalTotal += purchase.totalCostBs;
        inTransitCount += 1;
        capitalInTransitVes +=
          purchase.requestedTotalCostVes ?? purchase.requestedInvestmentVes ?? purchase.totalCostBs;
        capitalInTransitUsd += purchase.requestedUsd ?? 0;
        break;
      case 'approved':
        capitalInTransitVes +=
          purchase.executedTotalCostVes ?? purchase.totalCostBs;
        capitalInTransitUsd += purchase.accreditedUsd ?? purchase.requestedUsd ?? 0;
        break;
      case 'usd_credited':
        inTransitCapitalTotal += purchase.totalCostBs;
        inTransitCount += 1;
        capitalInBankVes +=
          purchase.executedTotalCostVes ??
          purchase.executedInvestmentVes ??
          purchase.totalCostBs;
        capitalInBankUsd += purchase.accreditedUsd ?? purchase.usdDeposited ?? 0;
        break;
      case 'deposited_binance':
        inTransitCapitalTotal += purchase.totalCostBs;
        inTransitCount += 1;
        capitalInBinanceVes += purchase.remainingCostVes ?? purchase.totalCostBs;
        capitalInBinanceUsdt +=
          purchase.remainingBinanceUsdt ?? purchase.usdDeposited ?? 0;
        break;
      case 'partial': {
        capitalInBinanceVes += purchase.remainingCostVes ?? purchase.totalCostBs;
        capitalInBinanceUsdt += purchase.remainingBinanceUsdt ?? 0;
        const profit = purchase.realizedProfitVes ?? 0;
        realizedProfitVes += profit;
        realizedProfitUsdt += toUsd(profit, purchaseSaleRate(purchase));
        realizedCostVes += purchase.allocatedCostVesTotal ?? 0;
        break;
      }
      case 'completed': {
        const profit =
          purchase.realizedProfitVes ??
          purchase.execution?.executedProfitBs ??
          purchase.estimatedProfitBs;
        completedProfitTotal += profit;
        completedCostTotal += purchase.totalCostBs;
        completedCount += 1;
        realizedProfitVes += profit;
        realizedProfitUsdt += toUsd(profit, purchaseSaleRate(purchase));
        realizedCostVes += purchase.allocatedCostVesTotal ?? purchase.totalCostBs;
        break;
      }
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
  const realizedProfit = round2(realizedProfitVes);
  const realizedRoiPct =
    realizedCostVes > 0 ? (realizedProfit / realizedCostVes) * 100 : 0;

  return {
    inTransitCapitalBs,
    inTransitCount,
    completedProfitBs,
    completedCostBs,
    weightedRoiPct,
    completedCount,
    cancelledCount,
    capitalInTransitVes: round2(capitalInTransitVes),
    capitalInTransitUsd: round2(capitalInTransitUsd),
    capitalInBankVes: round2(capitalInBankVes),
    capitalInBankUsd: round2(capitalInBankUsd),
    capitalInBinanceVes: round2(capitalInBinanceVes),
    capitalInBinanceUsdt: round2(capitalInBinanceUsdt),
    realizedProfitVes: realizedProfit,
    realizedProfitUsdt: round2(realizedProfitUsdt),
    realizedRoiPct,
  };
}
