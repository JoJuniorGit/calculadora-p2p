import type { PurchaseStatus } from '../../domain/types';
import { PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import { Badge, type BadgeTone } from '../../components/ui/Badge';

const statusTones: Record<PurchaseStatus, BadgeTone> = {
  pending: 'warning',
  usd_credited: 'info',
  deposited_binance: 'info',
  completed: 'success',
  cancelled: 'danger',
};

export interface StatusBadgeProps {
  status: PurchaseStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <Badge tone={statusTones[status]}>{PURCHASE_STATUS_LABELS[status]}</Badge>;
}
