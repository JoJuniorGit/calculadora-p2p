import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PurchaseRecord, PurchaseStatus } from '../../domain/types';
import { getNextStatuses, PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import { useAppStore } from '../../store/useAppStore';
import {
  formatAmount,
  formatBs,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatPct,
  formatPctWithFixedUsdt,
  formatRate,
  formatUsd,
  formatUsdt,
  toLocalDateKey,
} from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { TextField } from '../../components/ui/TextField';
import fields from '../../components/ui/fields.module.css';
import { StatusHistoryTimeline } from '../audit/StatusHistoryTimeline';
import { StatusBadge } from './StatusBadge';
import styles from './PurchaseDetailModal.module.css';

interface PurchaseDetailModalProps {
  purchaseId: string | null;
  onClose(): void;
  onRequestAccreditation(purchaseId: string): void;
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatProfilePct(value: number): string {
  return formatPct(value, Number.isInteger(value) ? 0 : 2);
}

function getLatestAuditTimestamp(purchase: PurchaseRecord): string {
  const timestamps = [
    purchase.createdAt,
    ...purchase.statusHistory.map((entry) => entry.timestamp),
    ...(purchase.execution ? [purchase.execution.closedAt] : []),
  ];

  return timestamps.reduce((latest, candidate) => {
    const latestTime = Date.parse(latest);
    const candidateTime = Date.parse(candidate);
    return Number.isFinite(candidateTime) && candidateTime > latestTime ? candidate : latest;
  }, purchase.createdAt);
}

function formatMode(purchase: PurchaseRecord): string {
  return purchase.mode === 'bs' ? 'Invertir Bs.S' : 'Solicitar USD';
}

function formatInputAmount(purchase: PurchaseRecord): string {
  return purchase.mode === 'bs'
    ? formatBs(purchase.inputAmount)
    : formatUsd(purchase.inputAmount);
}

function getPurchaseDateLabel(purchase: PurchaseRecord): string {
  return purchase.purchaseDate
    ? formatDateOnly(purchase.purchaseDate)
    : formatDate(purchase.createdAt);
}

function getRateSourceLabel(purchase: PurchaseRecord): string {
  if (purchase.rateReference?.source === 'historical') return 'Histórica';
  if (purchase.rateReference?.source === 'manual') return 'Manual';
  if (!purchase.purchaseDate) return 'Legada';
  return toLocalDateKey(purchase.createdAt) === purchase.purchaseDate
    ? 'En vivo'
    : 'Histórica';
}

function formatEnabled(enabled: boolean): string {
  return enabled ? 'Activado' : 'Desactivado';
}

function getCardBaseLabel(purchase: PurchaseRecord): string {
  return purchase.snapshot.cardCommissionBase === 'usd'
    ? 'Descontado de los USD'
    : 'Cobrado extra en Bs.S';
}

function getInterbankBaseLabel(): string {
  return 'Sobre el monto con intervención (0,50%)';
}

function getIgtfBaseLabel(purchase: PurchaseRecord): string {
  return purchase.snapshot.igtfBase === 'card'
    ? 'Sobre el cargo de la tarjeta'
    : 'Sobre la inversión total en Bs.S';
}

export function PurchaseDetailModal({
  purchaseId,
  onClose,
  onRequestAccreditation,
}: PurchaseDetailModalProps) {
  const purchase = useAppStore((state) =>
    state.purchases.find((record) => record.id === purchaseId) ?? null,
  );
  const updatePurchaseNotes = useAppStore((state) => state.updatePurchaseNotes);
  const changePurchaseStatus = useAppStore((state) => state.changePurchaseStatus);

  const [notes, setNotes] = useState('');
  const [notesNotice, setNotesNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [cancellationConfirmOpen, setCancellationConfirmOpen] = useState(false);
  const cancellationConfirmOpenRef = useRef(cancellationConfirmOpen);
  const onCloseRef = useRef(onClose);
  const notesId = useId();

  cancellationConfirmOpenRef.current = cancellationConfirmOpen;
  onCloseRef.current = onClose;

  const handleDetailClose = useCallback(() => {
    if (cancellationConfirmOpenRef.current) {
      setCancellationConfirmOpen(false);
      return;
    }
    onCloseRef.current();
  }, []);

  const cancelStatusConfirmation = useCallback(
    () => setCancellationConfirmOpen(false),
    [],
  );

  useEffect(() => {
    if (purchaseId !== null && !purchase) onClose();
  }, [onClose, purchase, purchaseId]);

  useEffect(() => {
    if (!purchase) return;
    setNotes(purchase.notes);
  }, [purchase?.id, purchase?.notes]);

  const applyStatusChange = (nextStatus: PurchaseStatus): boolean => {
    if (!purchase) return false;

    setTransitionError(null);
    try {
      changePurchaseStatus(purchase.id, nextStatus, transitionNote);
      setTransitionNote('');
      setCancellationConfirmOpen(false);
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'No fue posible cambiar el estado de la compra.');
      setTransitionError(message);
      return false;
    }
  };

  const handleStatusAction = (nextStatus: PurchaseStatus): void => {
    setTransitionError(null);

    if (nextStatus === 'cancelled') {
      setCancellationConfirmOpen(true);
      return;
    }

    if (nextStatus === 'approved') {
      if (purchase) onRequestAccreditation(purchase.id);
      return;
    }

    applyStatusChange(nextStatus);
  };

  const handleSaveNotes = (): void => {
    if (!purchase) return;
    try {
      updatePurchaseNotes(purchase.id, notes);
      setNotesNotice({ tone: 'success', message: 'Notas guardadas.' });
    } catch (error) {
      setNotesNotice({
        tone: 'error',
        message: getErrorMessage(error, 'No fue posible guardar las notas.'),
      });
    }
  };

  if (!purchaseId || !purchase) return null;

  const nextStatuses = getNextStatuses(purchase.status);
  const snapshot = purchase.snapshot;
  const appliedBinanceFee = snapshot.binancePercentFeeUsd ?? snapshot.binanceDepositUsd;
  const igtfUsd = snapshot.igtfCostUsd ?? 0;
  const hasAuditedSnapshot = snapshot.usdtNet !== undefined;
  const lastAuditTimestamp = getLatestAuditTimestamp(purchase);
  const summaryItems: DetailItem[] = [
    { label: 'Fecha de compra', value: getPurchaseDateLabel(purchase) },
    { label: 'Fuente de tasas', value: getRateSourceLabel(purchase) },
    { label: 'Invertido', value: formatBs(purchase.amountBs) },
    { label: 'Costo total', value: formatBs(purchase.totalCostBs) },
    { label: 'USD comprados', value: formatUsd(purchase.usdBought) },
    { label: 'USD para Binance', value: formatUsd(purchase.usdForBinance) },
    { label: 'USDT depositados', value: formatUsdt(purchase.usdDeposited) },
    { label: 'Bs.S esperados', value: formatBs(purchase.estimatedBsOut) },
    {
      label: 'Utilidad estimada y ROI',
      value: `${formatBs(purchase.estimatedProfitBs)} · ${formatPct(purchase.estimatedRoiPct)}`,
    },
    {
      label: 'Tasa de equilibrio',
      value: `${formatRate(purchase.breakEvenRate)} Bs.S/USDT`,
    },
    { label: 'Modo', value: formatMode(purchase) },
    { label: 'Monto ingresado', value: formatInputAmount(purchase) },
  ];

  const accreditationEntry = [...purchase.statusHistory]
    .reverse()
    .find((entry) => entry.metadata?.accreditationType !== undefined);
  const keepInterbankSunk = accreditationEntry?.metadata?.keepInterbankSunk;
  const showAccreditation =
    purchase.accreditationConfirmedAt !== null ||
    purchase.accreditationType === 'PARTIAL';
  const accreditationItems: DetailItem[] = [
    {
      label: 'Tipo de acreditación',
      value: `${purchase.accreditationType === 'PARTIAL' ? 'Parcial' : 'Total'} · ${formatPct(purchase.accreditationRatePercent, purchase.accreditationType === 'TOTAL' ? 0 : 2)}`,
    },
    { label: 'USD solicitados', value: formatUsd(purchase.requestedUsd) },
    { label: 'Bs.S solicitados', value: formatBs(purchase.requestedInvestmentVes) },
    { label: 'USD aprobados', value: formatUsd(purchase.accreditedUsd) },
    { label: 'Bs.S debitados', value: formatBs(purchase.executedInvestmentVes) },
    { label: 'Bs.S liberados', value: formatBs(purchase.refundedVes) },
    ...(purchase.accreditationConfirmedAt
      ? [
          {
            label: 'Confirmada',
            value: formatDateTime(purchase.accreditationConfirmedAt),
          },
        ]
      : []),
    ...(keepInterbankSunk !== undefined
      ? [
          {
            label: 'Interbancario hundido',
            value: keepInterbankSunk ? 'Sí' : 'No',
          },
        ]
      : []),
  ];

  const snapshotItems: DetailItem[] = [
    { label: 'Tasa BCV', value: `${formatRate(snapshot.bcvRate)} Bs.S/USD` },
    { label: 'Tasa Binance P2P', value: `${formatRate(snapshot.binanceRate)} Bs.S/USDT` },
    {
      label: 'Intervención',
      value: `${formatProfilePct(snapshot.interventionPct)} (fija) · ${formatBs(snapshot.interventionFeeBs)}`,
    },
    {
      label: 'Comisión de tarjeta',
      value: `${formatProfilePct(snapshot.cardCommissionPct)} · ${getCardBaseLabel(purchase)} · ${snapshot.cardCommissionBase === 'usd' ? formatUsd(snapshot.cardCommissionUsd) : formatBs(snapshot.cardCommissionBs)}`,
    },
    {
      label: 'Depósito Binance',
      value: `${formatPctWithFixedUsdt(snapshot.binanceDepositPct, snapshot.binanceDepositFixedUsd, Number.isInteger(snapshot.binanceDepositPct) ? 0 : 2)} · comisión aplicada ${formatUsdt(appliedBinanceFee)}`,
    },
    ...(hasAuditedSnapshot && snapshot.binanceDepositFixedUsd > 0
      ? [
          {
            label: 'Comisión fija P2P',
            value: `${formatUsdt(snapshot.binanceDepositFixedUsd)} · equivalente ${formatBs(snapshot.binanceFixedDiscountBs ?? 0)} a la tasa efectiva de venta`,
          },
        ]
      : []),
    ...(hasAuditedSnapshot
      ? [
          {
            label: 'USDT netos para venta',
            value: formatUsdt(snapshot.usdtNet ?? 0),
          },
        ]
      : []),
    {
      label: 'Interbancario',
      value: `${formatEnabled(snapshot.interbankEnabled)} · ${formatProfilePct(snapshot.interbankPct)} · ${getInterbankBaseLabel()} · cargo ${formatBs(snapshot.interbankCostBs)}`,
    },
    {
      label: 'IGTF',
      value: `${formatEnabled(snapshot.igtfEnabled)} · ${formatProfilePct(snapshot.igtfPct)} · ${getIgtfBaseLabel(purchase)} · cargo ${igtfUsd > 0 ? formatUsd(igtfUsd) : formatBs(snapshot.igtfCostBs)}`,
    },
    {
      label: 'Slippage',
      value: `${formatEnabled(snapshot.slippageEnabled)} · ${formatProfilePct(snapshot.slippagePct)}`,
    },
  ];

  const executionItems: DetailItem[] = purchase.execution
    ? [
        {
          label: 'Tasa real de venta',
          value: `${formatRate(purchase.execution.realBinanceRate)} Bs.S/USDT`,
        },
        { label: 'Bs.S ejecutados', value: formatBs(purchase.execution.executedBsOut) },
        { label: 'Ganancia ejecutada', value: formatBs(purchase.execution.executedProfitBs) },
        { label: 'ROI ejecutado', value: formatPct(purchase.execution.executedRoiPct) },
        {
          label: 'Fecha de cierre',
          value: formatDateTime(purchase.execution.closedAt),
        },
        {
          label: 'Ganancia ejecutada vs estimada',
          value: formatBs(purchase.execution.executedProfitBs - purchase.estimatedProfitBs),
        },
      ]
    : [];

  const initialInventoryUsdt =
    purchase.initialBinanceUsdt ?? purchase.usdDeposited ?? 0;
  const hasInventory =
    (purchase.status === 'deposited_binance' ||
      purchase.status === 'partial' ||
      purchase.status === 'completed') &&
    initialInventoryUsdt > 0;
  const inventoryItems: DetailItem[] = hasInventory
    ? [
        {
          label: 'Fondeado a Binance',
          value: purchase.fundedToBinanceAt
            ? formatDateTime(purchase.fundedToBinanceAt)
            : '-',
        },
        { label: 'USDT iniciales', value: formatUsdt(initialInventoryUsdt) },
        {
          label: 'Costo unitario en Binance',
          value: `${formatRate(purchase.unitCostInBinanceVes ?? 0)} Bs.S/USDT`,
        },
    { label: 'USDT vendidos', value: formatUsdt(purchase.soldUsdt ?? 0) },
    { label: 'USDT restantes', value: formatUsdt(purchase.remainingBinanceUsdt ?? 0) },
        {
          label: 'Costo asignado a ventas',
          value: formatBs(purchase.allocatedCostVesTotal ?? 0),
        },
        { label: 'Costo remanente', value: formatBs(purchase.remainingCostVes ?? 0) },
        {
          label: 'Ingreso realizado',
          value: formatBs(purchase.realizedRevenueVes ?? 0),
        },
        {
          label: 'Ganancia realizada',
          value: formatBs(purchase.realizedProfitVes ?? 0),
        },
        {
          label: 'Tasa promedio de venta',
          value: `${formatRate(purchase.weightedAverageSellRateVes ?? 0)} Bs.S/USDT`,
        },
      ]
    : [];
  const allocations = purchase.allocations ?? [];

  return (
    <>
      <Modal open title="Detalle de compra" onClose={handleDetailClose}>
        <div className={styles.content}>
          <header className={styles.recordHeader}>
            <div className={styles.recordIdentity}>
              <h3>{purchase.profileName}</h3>
              <StatusBadge status={purchase.status} />
            </div>
            <dl className={styles.headerMeta}>
              <div>
                <dt>Creada</dt>
                <dd>
                  <time dateTime={purchase.createdAt}>{formatDateTime(purchase.createdAt)}</time>
                </dd>
              </div>
              <div>
                <dt>Actualizada (último evento auditado)</dt>
                <dd>
                  <time dateTime={lastAuditTimestamp}>{formatDateTime(lastAuditTimestamp)}</time>
                </dd>
              </div>
              <div>
                <dt>Historial</dt>
                <dd>{purchase.statusHistory.length} eventos</dd>
              </div>
            </dl>
            <p className={styles.headerHint}>
              La fecha de actualización corresponde al último evento auditado; las notas no registran fecha de edición.
            </p>
          </header>

          <section className={styles.detailSection} aria-labelledby={`${notesId}-summary`}>
            <h3 id={`${notesId}-summary`} className={styles.sectionTitle}>Resumen</h3>
            <DetailList items={summaryItems} />
          </section>

          {hasInventory && (
            <section className={styles.detailSection} aria-labelledby={`${notesId}-inventory`}>
              <h3 id={`${notesId}-inventory`} className={styles.sectionTitle}>
                Inventario del lote en Binance
              </h3>
              <DetailList items={inventoryItems} />
            </section>
          )}

          {allocations.length > 0 && (
            <section className={styles.detailSection} aria-labelledby={`${notesId}-allocations`}>
              <h3 id={`${notesId}-allocations`} className={styles.sectionTitle}>
                Trazabilidad de ventas FIFO
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.allocationTable}>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
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
                    {allocations.map((allocation) => (
                      <tr key={allocation.allocationId}>
                        <td>{formatDateTime(allocation.allocatedAt)}</td>
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
          )}

          {showAccreditation && (
            <section className={styles.detailSection} aria-labelledby={`${notesId}-accreditation`}>
              <h3 id={`${notesId}-accreditation`} className={styles.sectionTitle}>
                Acreditación bancaria
              </h3>
              <DetailList items={accreditationItems} />
            </section>
          )}

          <section className={styles.detailSection} aria-labelledby={`${notesId}-snapshot`}>
            <h3 id={`${notesId}-snapshot`} className={styles.sectionTitle}>Snapshot reproducible</h3>
            <DetailList items={snapshotItems} />
          </section>

          {purchase.execution && (
            <section className={styles.detailSection} aria-labelledby={`${notesId}-execution`}>
              <h3 id={`${notesId}-execution`} className={styles.sectionTitle}>Ejecución</h3>
              <DetailList items={executionItems} />
            </section>
          )}

          <section className={styles.detailSection} aria-labelledby={`${notesId}-notes`}>
            <h3 id={`${notesId}-notes`} className={styles.sectionTitle}>Notas</h3>
            <div className={styles.noteField}>
              <label className={fields.label} htmlFor={`${notesId}-textarea`}>
                Notas de la compra
              </label>
              <textarea
                id={`${notesId}-textarea`}
                className={fields.textarea}
                value={notes}
                onChange={(event) => {
                  setNotes(event.currentTarget.value);
                  setNotesNotice(null);
                }}
              />
              <div className={styles.sectionActions}>
                <Button variant="secondary" onClick={handleSaveNotes}>
                  Guardar notas
                </Button>
                {notesNotice && (
                  <p
                    className={notesNotice.tone === 'success' ? styles.successNotice : styles.errorNotice}
                    role={notesNotice.tone === 'success' ? 'status' : 'alert'}
                  >
                    {notesNotice.message}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className={styles.detailSection} aria-labelledby={`${notesId}-audit`}>
            <h3 id={`${notesId}-audit`} className={styles.sectionTitle}>Estado y auditoría</h3>
            {transitionError && (
              <p className={styles.errorNotice} role="alert">{transitionError}</p>
            )}
            {nextStatuses.length > 0 ? (
              <div className={styles.transitionControls}>
                <TextField
                  label="Nota del cambio de estado (opcional)"
                  value={transitionNote}
                  onChange={(value) => {
                    setTransitionNote(value);
                    setTransitionError(null);
                  }}
                />
                <div className={styles.statusActions}>
                  {nextStatuses.map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      variant={nextStatus === 'cancelled' ? 'danger' : 'secondary'}
                      onClick={() => handleStatusAction(nextStatus)}
                    >
                      {PURCHASE_STATUS_LABELS[nextStatus]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className={styles.mutedText}>No hay transiciones disponibles para este estado.</p>
            )}
            <div className={styles.historySection}>
              <h4 className={styles.historyTitle}>Historial de estados</h4>
              <StatusHistoryTimeline entries={purchase.statusHistory} />
            </div>
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={cancellationConfirmOpen}
        title="Confirmar cancelación"
        message="¿Confirmas la cancelación de esta compra? El cambio quedará registrado en el historial y no se puede revertir."
        confirmLabel="Cancelar compra"
        cancelLabel="Volver"
        tone="danger"
        onConfirm={() => {
          setCancellationConfirmOpen(false);
          applyStatusChange('cancelled');
        }}
        onCancel={cancelStatusConfirmation}
      />
    </>
  );
}
