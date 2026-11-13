import type { ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { formatAmount, formatBs, formatDateTime, formatPct, formatRate, formatUsd } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import styles from './sales.module.css';

interface SaleDetailModalProps {
  saleId: string | null;
  onClose(): void;
  onRequestDelete(saleId: string): void;
}

interface DetailItem {
  label: string;
  value: ReactNode;
}

function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <dl className={styles.detailGrid}>
      {items.map((item, index) => (
        <div className={styles.detailItem} key={`${item.label}-${index}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SaleDetailModal({
  saleId,
  onClose,
  onRequestDelete,
}: SaleDetailModalProps) {
  const sale = useAppStore((state) =>
    state.sales.find((record) => record.id === saleId) ?? null,
  );
  const purchases = useAppStore((state) => state.purchases);

  if (!saleId || !sale) return null;

  const purchaseNames = new Map(
    purchases.map((purchase) => [purchase.id, purchase.profileName]),
  );
  const summary: DetailItem[] = [
    { label: 'Fecha', value: formatDateTime(sale.createdAt) },
    { label: 'USDT vendidos', value: formatUsd(sale.totalUsdtSold) },
    { label: 'Comisión fija P2P', value: formatUsd(sale.p2pFixedFeeUsdt) },
    { label: 'USDT netos liquidados', value: formatUsd(sale.netUsdtLiquidated) },
    { label: 'Tasa de venta', value: `${formatRate(sale.sellRateVes)} Bs.S/USDT` },
    { label: 'VES recibidos', value: formatBs(sale.totalVesReceived) },
    { label: 'Costo FIFO asignado', value: formatBs(sale.totalAllocatedCostVes) },
    { label: 'Ganancia realizada', value: formatBs(sale.totalRealizedProfitVes) },
    { label: 'ROI realizado', value: formatPct(sale.realizedRoiPercent) },
    { label: 'Saldo de billetera después', value: formatUsd(sale.walletBalanceAfterUsdt) },
  ];

  return (
    <Modal open title="Detalle de venta P2P" onClose={onClose}>
      <div className={styles.content}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Resumen</h3>
          <DetailList items={summary} />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Trazabilidad por lote</h3>
          <div className={styles.tableWrap}>
            <table className={styles.allocationsTable}>
              <thead>
                <tr>
                  <th scope="col">Lote de origen</th>
                  <th scope="col" className={styles.numericHeader}>USDT</th>
                  <th scope="col" className={styles.numericHeader}>Comisión (USDT)</th>
                  <th scope="col" className={styles.numericHeader}>Costo (Bs.S)</th>
                  <th scope="col" className={styles.numericHeader}>Ingreso (Bs.S)</th>
                  <th scope="col" className={styles.numericHeader}>Ganancia (Bs.S)</th>
                  <th scope="col" className={styles.numericHeader}>ROI</th>
                  <th scope="col" className={styles.numericHeader}>Queda (USDT)</th>
                </tr>
              </thead>
              <tbody>
                {sale.allocations.map((allocation) => (
                  <tr key={allocation.allocationId}>
                    <td>{purchaseNames.get(allocation.purchaseId) ?? allocation.purchaseId}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.usdtTaken)}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.p2pFeeShareUsdt)}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.allocatedCostVes)}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.allocatedRevenueVes)}</td>
                    <td
                      className={`${styles.numericCell} ${
                        allocation.allocatedProfitVes < 0
                          ? styles.negativeValue
                          : styles.positiveValue
                      }`}
                    >
                      {formatAmount(allocation.allocatedProfitVes)}
                    </td>
                    <td className={styles.numericCell}>{formatPct(allocation.allocatedRoiPercent)}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.lotRemainingUsdtAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {sale.notes.trim() && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notas</h3>
            <p className={styles.hint}>{sale.notes}</p>
          </section>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={() => onRequestDelete(sale.id)}
          >
            Eliminar venta
          </Button>
        </div>
      </div>
    </Modal>
  );
}
