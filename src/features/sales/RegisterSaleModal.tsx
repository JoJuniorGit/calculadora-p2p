import { useMemo, useState } from 'react';
import {
  DEFAULT_P2P_FIXED_FEE_USDT,
  previewFifoSale,
} from '../../domain/calculations';
import type { SaleRecord } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { formatAmount, formatBs, formatPct, formatRate, formatUsd } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { NumberField } from '../../components/ui/NumberField';
import { TextField } from '../../components/ui/TextField';
import styles from './sales.module.css';

interface RegisterSaleModalProps {
  open: boolean;
  onClose(): void;
  /** Called after a sale is confirmed, e.g. to reveal the sales list. */
  onRegistered?(): void;
}

interface PreviewState {
  sale: SaleRecord | null;
  error: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function RegisterSaleModal({ open, onClose, onRegistered }: RegisterSaleModalProps) {
  const purchases = useAppStore((state) => state.purchases);
  const sales = useAppStore((state) => state.sales);
  const registerSale = useAppStore((state) => state.registerSale);

  const [usdtText, setUsdtText] = useState('');
  const [rateText, setRateText] = useState('');
  const [feeText, setFeeText] = useState(String(DEFAULT_P2P_FIXED_FEE_USDT));
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const availableUsdt = useMemo(
    () =>
      purchases.reduce(
        (total, purchase) => total + (purchase.remainingBinanceUsdt ?? 0),
        0,
      ),
    [purchases],
  );

  const previewState = useMemo<PreviewState>(() => {
    const totalUsdtSold = Number(usdtText.trim().replace(',', '.'));
    const sellRateVes = Number(rateText.trim().replace(',', '.'));
    const p2pFixedFeeUsdt = Number(feeText.trim().replace(',', '.'));

    if (!usdtText.trim() || !rateText.trim() || !feeText.trim()) {
      return { sale: null, error: null };
    }
    if (!Number.isFinite(totalUsdtSold) || totalUsdtSold <= 0) {
      return { sale: null, error: 'El monto de la venta debe ser mayor que 0.' };
    }
    if (!Number.isFinite(sellRateVes) || sellRateVes <= 0) {
      return { sale: null, error: 'La tasa de venta debe ser mayor que 0.' };
    }
    if (!Number.isFinite(p2pFixedFeeUsdt) || p2pFixedFeeUsdt < 0) {
      return { sale: null, error: 'La comisión fija P2P no puede ser negativa.' };
    }

    try {
      const result = previewFifoSale(purchases, sales, {
        totalUsdtSold,
        sellRateVes,
        p2pFixedFeeUsdt,
        notes,
      });
      return { sale: result.preview, error: null };
    } catch (error) {
      return {
        sale: null,
        error: getErrorMessage(error, 'No fue posible simular la venta FIFO.'),
      };
    }
  }, [feeText, notes, purchases, rateText, sales, usdtText]);

  const preview = previewState.sale;
  const purchaseNames = useMemo(
    () => new Map(purchases.map((purchase) => [purchase.id, purchase.profileName])),
    [purchases],
  );

  const handleSubmit = (): void => {
    setSubmitError(null);
    if (!preview) return;

    const totalUsdtSold = Number(usdtText.trim().replace(',', '.'));
    const sellRateVes = Number(rateText.trim().replace(',', '.'));
    const p2pFixedFeeUsdt = Number(feeText.trim().replace(',', '.'));

    try {
      registerSale({ totalUsdtSold, sellRateVes, p2pFixedFeeUsdt, notes });
      setUsdtText('');
      setRateText('');
      setNotes('');
      onClose();
      onRegistered?.();
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'No fue posible registrar la venta.'));
    }
  };

  return (
    <Modal open={open} title="Registrar venta P2P" onClose={onClose}>
      <form
        className={styles.content}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Disponible en Binance</span>
            <strong className={styles.summaryValue}>{formatUsd(availableUsdt)}</strong>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Comisión fija P2P por venta</span>
            <strong className={styles.summaryValue}>
              {formatUsd(DEFAULT_P2P_FIXED_FEE_USDT)}
            </strong>
          </div>
        </div>

        <div className={styles.fieldGrid}>
          <NumberField
            label="USDT a vender"
            value={usdtText}
            onChange={(value) => {
              setUsdtText(value);
              setSubmitError(null);
            }}
            suffix="USDT"
            step="any"
            placeholder="Ej.: 500"
          />
          <NumberField
            label="Tasa de venta"
            value={rateText}
            onChange={(value) => {
              setRateText(value);
              setSubmitError(null);
            }}
            suffix="Bs.S/USDT"
            step="any"
            decimals={4}
            placeholder="Ej.: 1080,00"
          />
          <NumberField
            label="Comisión fija P2P"
            value={feeText}
            onChange={(value) => {
              setFeeText(value);
              setSubmitError(null);
            }}
            suffix="USDT"
            step="any"
            placeholder="0,06"
            hint="Se prorratea entre los lotes consumidos."
          />
        </div>

        <TextField
          label="Nota de la venta (opcional)"
          value={notes}
          onChange={(value) => setNotes(value)}
          placeholder="Ej.: Venta parcial en Binance P2P"
        />

        {previewState.error && (
          <p className={styles.dangerAlert} role="alert">
            {previewState.error}
          </p>
        )}

        {preview && (
          <>
            <div className={styles.previewGrid} aria-label="Vista previa FIFO de la venta">
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>VES recibidos</span>
                <strong className={styles.previewValue}>
                  {formatBs(preview.totalVesReceived)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Costo FIFO asignado</span>
                <strong className={styles.previewValue}>
                  {formatBs(preview.totalAllocatedCostVes)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Ganancia realizada</span>
                <strong
                  className={`${styles.previewValue} ${
                    preview.totalRealizedProfitVes < 0
                      ? styles.negativeValue
                      : styles.positiveValue
                  }`}
                >
                  {formatBs(preview.totalRealizedProfitVes)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>ROI realizado</span>
                <strong
                  className={`${styles.previewValue} ${
                    preview.realizedRoiPercent < 0
                      ? styles.negativeValue
                      : styles.positiveValue
                  }`}
                >
                  {formatPct(preview.realizedRoiPercent)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>USDT netos liquidados</span>
                <strong className={styles.previewValue}>
                  {formatUsd(preview.netUsdtLiquidated)}
                </strong>
              </article>
              <article className={styles.previewCard}>
                <span className={styles.previewLabel}>Saldo después de la venta</span>
                <strong className={styles.previewValue}>
                  {formatUsd(preview.walletBalanceAfterUsdt)}
                </strong>
              </article>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.allocationsTable}>
                <thead>
                  <tr>
                    <th scope="col">Lote</th>
                    <th scope="col" className={styles.numericHeader}>USDT</th>
                    <th scope="col" className={styles.numericHeader}>Costo (Bs.S)</th>
                    <th scope="col" className={styles.numericHeader}>Ingreso (Bs.S)</th>
                    <th scope="col" className={styles.numericHeader}>Ganancia (Bs.S)</th>
                    <th scope="col" className={styles.numericHeader}>ROI</th>
                    <th scope="col" className={styles.numericHeader}>Queda (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.allocations.map((allocation) => (
                    <tr key={allocation.allocationId}>
                      <td>{purchaseNames.get(allocation.purchaseId) ?? allocation.purchaseId}</td>
                      <td className={styles.numericCell}>{formatAmount(allocation.usdtTaken)}</td>
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

            <p className={styles.hint}>
              Orden FIFO por fecha de fondeo a Binance, luego por fecha de creación. La tasa de venta es {formatRate(preview.sellRateVes)} Bs.S/USDT.
            </p>
          </>
        )}

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
            Confirmar venta
          </Button>
        </div>
      </form>
    </Modal>
  );
}
