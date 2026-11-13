import type { PurchaseFilters, PurchaseRecord } from '../../domain/types';

function getLocalDayBoundary(value: string, nextDay = false): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  if (nextDay) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function filterPurchases(
  purchases: PurchaseRecord[],
  filters: PurchaseFilters,
): PurchaseRecord[] {
  const dateFrom = filters.dateFrom
    ? getLocalDayBoundary(filters.dateFrom)
    : null;
  // Interpret yyyy-mm-dd in the browser's local calendar and use the next local midnight as an
  // exclusive upper bound, avoiding UTC shifts while including the full selected end date.
  const dateToExclusive = filters.dateTo
    ? getLocalDayBoundary(filters.dateTo, true)
    : null;

  return purchases.filter((purchase) => {
    if (filters.status !== 'all' && purchase.status !== filters.status) return false;
    if (filters.profileName !== 'all' && purchase.profileName !== filters.profileName) {
      return false;
    }

    if (dateFrom !== null || dateToExclusive !== null) {
      const purchaseTimestamp = purchase.purchaseDate
        ? getLocalDayBoundary(purchase.purchaseDate)
        : Date.parse(purchase.createdAt);
      if (purchaseTimestamp === null || !Number.isFinite(purchaseTimestamp)) return false;
      if (dateFrom !== null && purchaseTimestamp < dateFrom) return false;
      if (dateToExclusive !== null && purchaseTimestamp >= dateToExclusive) return false;
    }

    return true;
  });
}
