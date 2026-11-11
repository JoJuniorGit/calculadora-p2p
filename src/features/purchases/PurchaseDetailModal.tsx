import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PurchaseRecord, PurchaseStatus } from '../../domain/types';
import { getNextStatuses, PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import { useAppStore } from '../../store/useAppStore';
import {
  formatBs,
  formatDateTime,
  formatPct,
  formatPctWithFixedUsd,
  formatRate,
  formatUsd,
  toInputNumber,
} from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { NumberField } from '../../components/ui/NumberField';
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

function formatEnabled(enabled: boolean): string {
  return enabled ? 'Activado' : 'Desactivado';
}

function getCardBaseLabel(purchase: PurchaseRecord): string {
  return purchase.snapshot.cardCommissionBase === 'usd'
    ? 'Descontado de los USD'
    : 'Cobrado extra en Bs.S';
}

function getInterbankBaseLabel(purchase: PurchaseRecord): string {
  return purchase.snapshot.interbankBase === 'initial'
    ? 'Sobre la inversión inicial'
    : 'Sobre los Bs.S netos post-intervención';
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
  const rates = useAppStore((state) => state.rates);
  const updatePurchaseNotes = useAppStore((state) => state.updatePurchaseNotes);
  const changePurchaseStatus = useAppStore((state) => state.changePurchaseStatus);

  const [notes, setNotes] = useState('');
  const [notesNotice, setNotesNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [cancellationConfirmOpen, setCancellationConfirmOpen] = useState(false);
  const [realSaleRateText, setRealSaleRateText] = useState('');
  const [realSaleRateError, setRealSaleRateError] = useState<string | undefined>();
  const closingModalOpenRef = useRef(closingModalOpen);
  const cancellationConfirmOpenRef = useRef(cancellationConfirmOpen);
  const onCloseRef = useRef(onClose);
  const notesId = useId();

  closingModalOpenRef.current = closingModalOpen;
  cancellationConfirmOpenRef.current = cancellationConfirmOpen;
  onCloseRef.current = onClose;

  const handleDetailClose = useCallback(() => {
    if (closingModalOpenRef.current) {
      setClosingModalOpen(false);
      return;
    }
    if (cancellationConfirmOpenRef.current) {
      setCancellationConfirmOpen(false);
      return;
    }
    onCloseRef.current();
  }, []);

  const closeSaleDialog = useCallback(() => setClosingModalOpen(false), []);
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

  const applyStatusChange = (nextStatus: PurchaseStatus, realSaleRate?: number): boolean => {
    if (!purchase) return false;

    setTransitionError(null);
    try {
      changePurchaseStatus(purchase.id, nextStatus, transitionNote, realSaleRate);
      setTransitionNote('');
      setCancellationConfirmOpen(false);
      setClosingModalOpen(false);
      setRealSaleRateError(undefined);
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'No fue posible cambiar el estado de la compra.');
      setTransitionError(message);
      if (nextStatus === 'completed') setRealSaleRateError(message);
      return false;
    }
  };

  const handleStatusAction = (nextStatus: PurchaseStatus): void => {
    setTransitionError(null);
    setRealSaleRateError(undefined);

    if (nextStatus === 'cancelled') {
      setCancellationConfirmOpen(true);
      return;
    }

    if (purchase && purchase.accreditationConfirmedAt === null) {
      onRequestAccreditation(purchase.id);
      return;
    }

    if (nextStatus === 'completed') {
      setRealSaleRateText(rates.binance.value > 0 ? toInputNumber(rates.binance.value) : '');
      setClosingModalOpen(true);
      return;
    }

    applyStatusChange(nextStatus);
  };

  const handleComplete = (): void => {
    const normalizedRate = realSaleRateText.trim().replace(',', '.');
    const realSaleRate = normalizedRate === '' ? Number.NaN : Number(normalizedRate);
    if (!Number.isFinite(realSaleRate) || realSaleRate <= 0) {
      setRealSaleRateError('Ingresa una tasa de venta mayor que 0.');
      return;
    }

    setRealSaleRateError(undefined);
    applyStatusChange('completed', realSaleRate);
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
    { label: 'Invertido', value: formatBs(purchase.amountBs) },
    { label: 'Costo total', value: formatBs(purchase.totalCostBs) },
    { label: 'USD comprados', value: formatUsd(purchase.usdBought) },
    { label: 'USD para Binance', value: formatUsd(purchase.usdForBinance) },
    { label: 'USD depositados', value: formatUsd(purchase.usdDeposited) },
    { label: 'Bs.S esperados', value: formatBs(purchase.estimatedBsOut) },
    {
      label: 'Utilidad estimada y ROI',
      value: `${formatBs(purchase.estimatedProfitBs)} · ${formatPct(purchase.estimatedRoiPct)}`,
    },
    {
      label: 'Tasa de equilibrio',
      value: `${formatRate(purchase.breakEvenRate)} Bs.S/USD`,
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
    { label: 'Tasa Binance P2P', value: `${formatRate(snapshot.binanceRate)} Bs.S/USD` },
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
      value: `${formatPctWithFixedUsd(snapshot.binanceDepositPct, snapshot.binanceDepositFixedUsd, Number.isInteger(snapshot.binanceDepositPct) ? 0 : 2)} · comisión aplicada ${formatUsd(appliedBinanceFee)}`,
    },
    ...(hasAuditedSnapshot && snapshot.binanceDepositFixedUsd > 0
      ? [
          {
            label: 'Comisión fija P2P',
            value: `${formatUsd(snapshot.binanceDepositFixedUsd)} · equivalente ${formatBs(snapshot.binanceFixedDiscountBs ?? 0)} a la tasa efectiva de venta`,
          },
        ]
      : []),
    ...(hasAuditedSnapshot
      ? [
          {
            label: 'USDT netos para venta',
            value: formatUsd(snapshot.usdtNet ?? 0),
          },
        ]
      : []),
    {
      label: 'Interbancario',
      value: `${formatEnabled(snapshot.interbankEnabled)} · ${formatProfilePct(snapshot.interbankPct)} · ${getInterbankBaseLabel(purchase)} · cargo ${formatBs(snapshot.interbankCostBs)}`,
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
          value: `${formatRate(purchase.execution.realBinanceRate)} Bs.S/USD`,
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
            {transitionError && !closingModalOpen && (
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

      <Modal open={closingModalOpen} title="Cerrar operación" onClose={closeSaleDialog}>
        <form
          className={styles.closeForm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleComplete();
          }}
        >
          <p className={styles.mutedText}>
            Registra la tasa real de venta en Binance para calcular el resultado ejecutado.
          </p>
          {transitionError && <p className={styles.errorNotice} role="alert">{transitionError}</p>}
          <NumberField
            label="Tasa Binance real de venta"
            value={realSaleRateText}
            onChange={(value) => {
              setRealSaleRateText(value);
              setRealSaleRateError(undefined);
              setTransitionError(null);
            }}
            error={realSaleRateError}
            suffix="Bs.S/USD"
            step="any"
            placeholder="Ej.: 42,50"
          />
          <TextField
            label="Nota del cambio de estado (opcional)"
            value={transitionNote}
            onChange={(value) => {
              setTransitionNote(value);
              setTransitionError(null);
            }}
          />
          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={closeSaleDialog}>
              Volver
            </Button>
            <Button type="submit">Confirmar cierre</Button>
          </div>
        </form>
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
