import { useEffect, useMemo, useState } from 'react';
import { recalculateAccreditation, type AccreditationResult } from '../../domain/calculations';
import type { AccreditationType } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import {
  formatBs,
  formatPct,
  formatRate,
  formatUsd,
  toInputNumber,
} from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { NumberField } from '../../components/ui/NumberField';
import { TextField } from '../../components/ui/TextField';
import { ToggleField } from '../../components/ui/ToggleField';
import styles from './PurchaseAccreditationModal.module.css';

interface PurchaseAccreditationModalProps {
  purchaseId: string | null;
  onClose(): void;
}

type PreviewState =
  | { status: 'ok'; result: AccreditationResult }
  | { status: 'error'; message: string }
  | null;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PurchaseAccreditationModal({
  purchaseId,
  onClose,
}: PurchaseAccreditationModalProps) {
  const purchase = useAppStore((state) =>
    state.purchases.find((record) => record.id === purchaseId) ?? null,
  );
  const accreditPurchase = useAppStore((state) => state.accreditPurchase);

  const [mode, setMode] = useState<AccreditationType>('TOTAL');
  const [accreditedText, setAccreditedText] = useState('');
  const [keepInterbankSunk, setKeepInterbankSunk] = useState(true);
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchase) return;
    setMode('TOTAL');
    setAccreditedText(toInputNumber(purchase.requestedUsd));
    setKeepInterbankSunk(true);
    setNote('');
    setSubmitError(null);
  }, [purchaseId]);

  const normalizedText = accreditedText.trim().replace(',', '.');
  const parsedAccreditedUsd =
    normalizedText === '' ? Number.NaN : Number(normalizedText);
  const isPartial = mode === 'PARTIAL';
  const partialError =
    isPartial && purchase
      ? !Number.isFinite(parsedAccreditedUsd) || parsedAccreditedUsd <= 0
        ? 'Ingresa un monto mayor que 0.'
        : parsedAccreditedUsd > purchase.requestedUsd
          ? `No puede superar los USD solicitados (${formatUsd(purchase.requestedUsd)}).`
          : undefined
      : undefined;
  const accreditedUsd =
    isPartial && purchase ? parsedAccreditedUsd : (purchase?.requestedUsd ?? 0);

  const previewState = useMemo<PreviewState>(() => {
    if (!purchase || partialError) return null;
    try {
      return {
        status: 'ok',
        result: recalculateAccreditation(
          purchase,
          accreditedUsd,
          keepInterbankSunk,
        ),
      };
    } catch (error) {
      return {
        status: 'error',
        message: getErrorMessage(
          error,
          'No fue posible calcular la acreditación con estos valores.',
        ),
      };
    }
  }, [accreditedUsd, keepInterbankSunk, partialError, purchase]);

  if (!purchaseId || !purchase || purchase.status !== 'pending') return null;

  const preview = previewState?.status === 'ok' ? previewState.result : null;
  const previewError =
    previewState?.status === 'error'
      ? previewState.message
      : partialError;
  const degraded =
    preview !== null && preview.roiPct < purchase.estimatedRoiPct;

  const handleConfirm = (): void => {
    if (!preview) return;
    setSubmitError(null);
    try {
      accreditPurchase(purchase.id, {
        accreditationType: mode,
        accreditedUsd,
        keepInterbankSunk,
        note,
      });
      onClose();
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, 'No fue posible registrar la acreditación.'),
      );
    }
  };

  return (
    <Modal open title="Acreditación bancaria" onClose={onClose}>
      <form
        className={styles.content}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handleConfirm();
        }}
      >
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>USD solicitados</span>
            <strong className={styles.summaryValue}>
              {formatUsd(purchase.requestedUsd)}
            </strong>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Comprometido originalmente</span>
            <strong className={styles.summaryValue}>
              {formatBs(purchase.requestedInvestmentVes)}
            </strong>
          </div>
        </div>

        <div
          className={styles.modeSelector}
          role="group"
          aria-label="Tipo de acreditación"
        >
          <button
            className={`${styles.modeButton} ${mode === 'TOTAL' ? styles.modeButtonActive : ''}`}
            type="button"
            aria-pressed={mode === 'TOTAL'}
            onClick={() => {
              setMode('TOTAL');
              setSubmitError(null);
            }}
          >
            Acreditación total (100%)
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'PARTIAL' ? styles.modeButtonActive : ''}`}
            type="button"
            aria-pressed={mode === 'PARTIAL'}
            onClick={() => {
              setMode('PARTIAL');
              setSubmitError(null);
            }}
          >
            Acreditación parcial
          </button>
        </div>

        {isPartial ? (
          <NumberField
            label="USD aprobados por el banco"
            name="accredited-usd"
            value={accreditedText}
            onChange={(value) => {
              setAccreditedText(value);
              setSubmitError(null);
            }}
            suffix="USD"
            step="any"
            placeholder="Ej.: 120,00"
            error={partialError}
            hint="Debe ser mayor que 0 y no puede superar los USD solicitados."
            action={
              preview ? (
                <span className={styles.rateIndicator}>
                  {formatPct(preview.accreditationRatePercent)} de lo solicitado
                </span>
              ) : undefined
            }
          />
        ) : (
          <p className={styles.totalHint}>
            Se acreditarán los {formatUsd(purchase.requestedUsd)} solicitados sin
            cambios en el capital comprometido.
          </p>
        )}

        {previewError && (
          <p className={styles.dangerAlert} role="alert">
            {previewError}
          </p>
        )}

        {preview && (
          <>
            <div className={styles.previewGrid} aria-label="Vista previa de la acreditación">
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Bs.S debitados</span>
                <strong className={styles.previewValue}>
                  {formatBs(preview.amountBs)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Bs.S liberados</span>
                <strong
                  className={`${styles.previewValue} ${preview.refundedVes > 0 ? styles.positiveValue : ''}`}
                >
                  {formatBs(preview.refundedVes)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Monto para tarjeta</span>
                <strong className={styles.previewValue}>
                  {formatUsd(preview.usdBought)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Monto a ingresar en Binance</span>
                <strong className={styles.previewValue}>
                  {formatUsd(preview.usdForBinance)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>USD netos en Binance</span>
                <strong className={styles.previewValue}>
                  {formatUsd(preview.usdDeposited)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Costo total ejecutado</span>
                <strong className={styles.previewValue}>
                  {formatBs(preview.totalCostBs)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>ROI estimado</span>
                <strong
                  className={`${styles.previewValue} ${
                    preview.roiPct < 0
                      ? styles.negativeValue
                      : preview.profitability === 'yellow'
                        ? styles.warningValue
                        : styles.positiveValue
                  }`}
                >
                  {formatPct(preview.roiPct)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Tasa de equilibrio</span>
                <strong className={styles.previewValue}>
                  {formatRate(preview.breakEvenRate)} Bs.S/USD
                </strong>
              </article>
            </div>

            {preview.profitability === 'red' && (
              <p className={styles.dangerAlert} role="alert">
                La operación queda con utilidad negativa: los costos fijos o
                hundidos superan el retorno con este volumen.
              </p>
            )}
            {preview.profitability === 'yellow' && (
              <p className={styles.warningAlert} role="status">
                El ROI queda por debajo del 3% saludable. Revisa la tasa mínima
                antes de confirmar.
              </p>
            )}
            {degraded && preview.profitability === 'green' && (
              <p className={styles.warningAlert} role="status">
                El ROI baja respecto de la estimación original por el peso de los
                costos fijos o hundidos.
              </p>
            )}
          </>
        )}

        {purchase.snapshot.interbankEnabled && (
          <ToggleField
            label="Mantener comisión interbancaria sobre el monto inicial transferido (costo hundido)"
            checked={keepInterbankSunk}
            onChange={(checked) => {
              setKeepInterbankSunk(checked);
              setSubmitError(null);
            }}
            hint="Si está activo, el costo interbancario original no se reduce aunque el banco apruebe menos divisas."
          />
        )}

        <TextField
          label="Nota de auditoría (opcional)"
          name="accreditation-note"
          value={note}
          onChange={(value) => {
            setNote(value);
            setSubmitError(null);
          }}
          placeholder="Ej.: Corte de mesa de cambio, adjudicado 40%"
        />

        {submitError && (
          <p className={styles.dangerAlert} role="alert">
            {submitError}
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!preview}>
            Confirmar acreditación
          </Button>
        </div>
      </form>
    </Modal>
  );
}
