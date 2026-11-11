import type { PurchaseExecution, PurchaseRecord, PurchaseStatus } from './types';
import { round2 } from './calculations';

export const PURCHASE_STATUS_ORDER: PurchaseStatus[] = [
  'pending',
  'usd_credited',
  'deposited_binance',
  'completed',
  'cancelled',
];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  pending: 'Pendiente',
  usd_credited: 'Divisas acreditadas',
  deposited_binance: 'Depositado a Binance',
  completed: 'Vendido/Completado',
  cancelled: 'Cancelado',
};

const nextStatuses: Record<PurchaseStatus, PurchaseStatus[]> = {
  pending: ['usd_credited', 'cancelled'],
  usd_credited: ['deposited_binance', 'cancelled'],
  deposited_binance: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function getNextStatuses(status: PurchaseStatus): PurchaseStatus[] {
  return [...nextStatuses[status]];
}

export function canTransition(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return nextStatuses[from].includes(to);
}

export function calculateExecution(
  purchase: PurchaseRecord,
  realBinanceRate: number,
): PurchaseExecution {
  if (!Number.isFinite(realBinanceRate) || realBinanceRate <= 0) {
    throw new Error('La tasa real de venta debe ser mayor que 0');
  }

  // New records keep USD_3 (before the fixed P2P fee) in usdDeposited, so the
  // fixed fee must be deducted at sale. Legacy records stored usdDeposited after
  // that fee; usdtNet marks the new semantics and avoids double subtraction.
  const saleUsd =
    purchase.snapshot.usdtNet !== undefined
      ? Math.max(0, purchase.usdDeposited - purchase.snapshot.binanceDepositFixedUsd)
      : purchase.usdDeposited;
  const executedBsOut = round2(saleUsd * realBinanceRate);
  const executedProfitBs = round2(executedBsOut - purchase.totalCostBs);
  const executedRoiPct =
    purchase.totalCostBs > 0 ? (executedProfitBs / purchase.totalCostBs) * 100 : 0;

  return {
    realBinanceRate,
    executedBsOut,
    executedProfitBs,
    executedRoiPct,
    closedAt: new Date().toISOString(),
  };
}
