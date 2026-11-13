import type { PurchaseRecord } from '../../domain/types';
import { PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import type { PurchasePnl, PnlState } from './purchasePnl';
import {
  formatAmount,
  formatBs,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatPct,
  formatRate,
  formatUsd,
} from '../../utils/format';
import { StatusHistoryTimeline } from '../audit/StatusHistoryTimeline';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import styles from './PurchaseInlineDetail.module.css';

const PNL_STATE_LABELS: Record<PnlState, string> = {
  projected: 'Proyectado',
  partial: 'Parcial',
  realized: 'Real',
};

const ESTIMATE_TOOLTIPS: Record<'projected' | 'partial', string> = {
  projected:
    'Resultado proyectado con la tasa actual de Binance; aún no hay ventas ejecutadas para este lote.',
  partial:
    'Resultado parcial: incluye solo las ventas ya ejecutadas del lote; el resto sigue proyectado.',
};

interface PurchaseInlineDetailProps {
  purchase: PurchaseRecord;
  pnl: PurchasePnl | null;
}

function getPurchaseDateLabel(purchase: PurchaseRecord): string {
  return purchase.purchaseDate
    ? formatDateOnly(purchase.purchaseDate)
    : formatDate(purchase.createdAt);
}

export function PurchaseInlineDetail({ purchase, pnl }: PurchaseInlineDetailProps) {
  const soldUsdt = purchase.soldUsdt ?? 0;
  const initialUsdt = purchase.initialBinanceUsdt;
  const remainingUsdt = purchase.remainingBinanceUsdt;
  const allocations = purchase.allocations ?? [];
  const profitTone =
    (pnl?.profitVes ?? 0) < 0 ? styles.negativeValue : styles.positiveValue;
  const estimateState = pnl && pnl.state !== 'realized' ? pnl.state : null;
  const stateLabel = pnl ? PNL_STATE_LABELS[pnl.state] : '';
  const estimateTooltip = estimateState ? ESTIMATE_TOOLTIPS[estimateState] : null;

  const renderPnlValue = (value: string) => (
    <span className={styles.valueLine}>
      {`${value} · ${stateLabel}`}
      {estimateTooltip && (
        <InfoTooltip
          label={`Qué significa el estado ${stateLabel}`}
          content={estimateTooltip}
          align="center"
        />
      )}
    </span>
  );

  return (
    <div className={styles.detail}>
      <div className={styles.columns}>
        <section className={styles.section} aria-label="Resumen de la compra">
          <h3>Resumen</h3>
          <dl className={styles.list}>
            <div>
              <dt>Inversión</dt>
              <dd>{formatBs(purchase.totalCostBs)}</dd>
            </div>
            <div>
              <dt>USD comprados</dt>
              <dd>{formatUsd(purchase.usdBought)}</dd>
            </div>
            <div>
              <dt>Banco</dt>
              <dd>{purchase.profileName}</dd>
            </div>
            <div>
              <dt>Compra</dt>
              <dd>{getPurchaseDateLabel(purchase)}</dd>
            </div>
            <div>
              <dt>Registro</dt>
              <dd>{formatDateTime(purchase.createdAt)}</dd>
            </div>
            <div>
              <dt>Tasa BCV</dt>
              <dd>{`${formatRate(purchase.bcvRate)} Bs.S/USD`}</dd>
            </div>
            <div>
              <dt>Tasa Binance P2P</dt>
              <dd>{`${formatRate(purchase.binanceRate)} Bs.S/USD`}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-label="Rendimiento de la compra">
          <h3>Rendimiento</h3>
          <dl className={styles.list}>
            <div>
              <dt>Resultado</dt>
              <dd className={estimateState ? styles.estimatedValue : undefined}>
                {pnl ? renderPnlValue(`${formatAmount(pnl.resultVes)} Bs.S`) : '—'}
              </dd>
            </div>
            <div>
              <dt>Ganancia</dt>
              <dd className={estimateState ? styles.estimatedValue : profitTone}>
                {pnl ? renderPnlValue(`${formatAmount(pnl.profitVes)} Bs.S`) : '—'}
              </dd>
            </div>
            <div>
              <dt>ROI</dt>
              <dd className={estimateState ? styles.estimatedValue : undefined}>
                {pnl ? renderPnlValue(formatPct(pnl.roiPct)) : '—'}
              </dd>
            </div>
            <div>
              <dt>USDT vendidos</dt>
              <dd>{`${formatAmount(soldUsdt)} USDT`}</dd>
            </div>
            <div>
              <dt>USDT en Binance</dt>
              <dd>
                {remainingUsdt === undefined
                  ? '—'
                  : initialUsdt === undefined
                    ? `${formatAmount(remainingUsdt)} USDT`
                    : `${formatAmount(remainingUsdt)} / ${formatAmount(initialUsdt)} USDT`}
              </dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{PURCHASE_STATUS_LABELS[purchase.status]}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-label="Historial de la compra">
          <h3>Historial de estados</h3>
          <StatusHistoryTimeline entries={purchase.statusHistory} />
        </section>
      </div>

      {allocations.length > 0 && (
        <section className={styles.section} aria-label="Ventas asignadas">
          <h3>Ventas asignadas</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col" className={styles.numericHeader}>USDT</th>
                  <th scope="col" className={styles.numericHeader}>Tasa</th>
                  <th scope="col" className={styles.numericHeader}>Ingreso</th>
                  <th scope="col" className={styles.numericHeader}>Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((allocation) => (
                  <tr key={allocation.allocationId}>
                    <td>{formatDate(allocation.allocatedAt)}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.usdtTaken)}</td>
                    <td className={styles.numericCell}>{formatAmount(allocation.sellRateVes)}</td>
                    <td className={styles.numericCell}>{formatBs(allocation.allocatedRevenueVes)}</td>
                    <td
                      className={`${styles.numericCell} ${
                        allocation.allocatedProfitVes < 0
                          ? styles.negativeValue
                          : styles.positiveValue
                      }`}
                    >
                      {formatBs(allocation.allocatedProfitVes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {purchase.notes.trim() !== '' && (
        <section className={styles.section} aria-label="Notas de la compra">
          <h3>Notas</h3>
          <p className={styles.notes}>{purchase.notes}</p>
        </section>
      )}
    </div>
  );
}
