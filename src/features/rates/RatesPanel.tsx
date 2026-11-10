import { useEffect, useRef, useState } from 'react';
import type { RateKey, RateQuote } from '../../domain/types';
import { getExchangeGap } from '../../domain/calculations';
import { formatDateTime, formatPct, formatRate, toInputNumber } from '../../utils/format';
import { useAppStore } from '../../store/useAppStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { NumberField } from '../../components/ui/NumberField';
import { fetchBcvRate, fetchBinanceRate } from './ratesApi';
import styles from './RatesPanel.module.css';

type Notice = { tone: 'success' | 'error'; message: string };

function parseRateInput(value: string): number {
  if (value.trim() === '') return Number.NaN;
  return Number(value.replace(',', '.'));
}

interface RateCardProps {
  rateKey: RateKey;
  title: string;
  rate: RateQuote;
  value: string;
  loading: boolean;
  disabled: boolean;
  error?: string;
  onValueChange(value: string): void;
  onRefresh(): void;
}

function RateCard({
  rateKey,
  title,
  rate,
  value,
  loading,
  disabled,
  error,
  onValueChange,
  onRefresh,
}: RateCardProps) {
  return (
    <Card title={title} className={styles.rateCard}>
      <div className={styles.rateCardContent}>
        <div className={styles.rateMeta}>
          <Badge tone={rate.source === 'auto' ? 'info' : 'neutral'}>
            {rate.source === 'auto' ? 'Automático' : 'Manual'}
          </Badge>
          <span className={styles.updatedAt}>Última actualización: {formatDateTime(rate.updatedAt)}</span>
        </div>
        <NumberField
          label="Tasa en Bs.S por USD"
          name={`${rateKey}-rate`}
          value={value}
          onChange={onValueChange}
          suffix="Bs.S"
          step={0.01}
          error={error}
          placeholder="Ej.: 36,50"
        />
        <Button variant="secondary" onClick={onRefresh} disabled={disabled}>
          {loading ? 'Actualizando…' : 'Actualizar automáticamente'}
        </Button>
      </div>
    </Card>
  );
}

export function RatesPanel() {
  const bcv = useAppStore((state) => state.rates.bcv);
  const binance = useAppStore((state) => state.rates.binance);
  const setRate = useAppStore((state) => state.setRate);
  const [inputValues, setInputValues] = useState<Record<RateKey, string>>({
    bcv: bcv.value > 0 ? toInputNumber(bcv.value) : '',
    binance: binance.value > 0 ? toInputNumber(binance.value) : '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RateKey, string>>>({});
  const [loadingKey, setLoadingKey] = useState<RateKey | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const lastManualValue = useRef<Partial<Record<RateKey, number>>>({});

  useEffect(() => {
    const lastValue = lastManualValue.current.bcv;
    if (lastValue !== undefined && lastValue === bcv.value) {
      delete lastManualValue.current.bcv;
      return;
    }

    setInputValues((current) => ({
      ...current,
      bcv: bcv.value > 0 ? toInputNumber(bcv.value) : '',
    }));
    setFieldErrors((current) => ({ ...current, bcv: undefined }));
  }, [bcv.value, bcv.updatedAt]);

  useEffect(() => {
    const lastValue = lastManualValue.current.binance;
    if (lastValue !== undefined && lastValue === binance.value) {
      delete lastManualValue.current.binance;
      return;
    }

    setInputValues((current) => ({
      ...current,
      binance: binance.value > 0 ? toInputNumber(binance.value) : '',
    }));
    setFieldErrors((current) => ({ ...current, binance: undefined }));
  }, [binance.value, binance.updatedAt]);

  const handleManualChange = (key: RateKey, text: string): void => {
    setInputValues((current) => ({ ...current, [key]: text }));
    const value = parseRateInput(text);

    if (!Number.isFinite(value) || value <= 0) {
      setFieldErrors((current) => ({ ...current, [key]: 'Ingresa una tasa válida mayor que 0.' }));
      return;
    }

    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    lastManualValue.current[key] = value;
    setRate(key, value, 'manual');
  };

  const handleRefresh = async (key: RateKey): Promise<void> => {
    setLoadingKey(key);
    setNotice(null);

    try {
      const fetched = key === 'bcv' ? await fetchBcvRate() : await fetchBinanceRate();
      setRate(key, fetched.value, 'auto');
      setInputValues((current) => ({ ...current, [key]: toInputNumber(fetched.value) }));
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
      setNotice({ tone: 'success', message: `Actualizado desde ${fetched.provider}.` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setNotice({
        tone: 'error',
        message: `No fue posible actualizar la tasa. Revisa la conexión, el acceso CORS o la disponibilidad del servicio. Se conserva el valor actual. ${detail}`,
      });
    } finally {
      setLoadingKey(null);
    }
  };

  const gap =
    Number.isFinite(bcv.value) && bcv.value > 0 &&
    Number.isFinite(binance.value) && binance.value > 0
      ? getExchangeGap(bcv.value, binance.value)
      : null;

  return (
    <section className={styles.panel} aria-label="Tasas de cambio">
      {notice && (
        <div
          className={notice.tone === 'error' ? styles.errorNotice : styles.successNotice}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
        >
          {notice.message}
        </div>
      )}

      <div className={styles.rateGrid}>
        <RateCard
          rateKey="bcv"
          title="Tasa BCV (Bs.S/USD)"
          rate={bcv}
          value={inputValues.bcv}
          loading={loadingKey === 'bcv'}
          disabled={loadingKey !== null}
          error={fieldErrors.bcv}
          onValueChange={(value) => handleManualChange('bcv', value)}
          onRefresh={() => void handleRefresh('bcv')}
        />
        <RateCard
          rateKey="binance"
          title="Tasa Binance P2P (Bs.S/USD)"
          rate={binance}
          value={inputValues.binance}
          loading={loadingKey === 'binance'}
          disabled={loadingKey !== null}
          error={fieldErrors.binance}
          onValueChange={(value) => handleManualChange('binance', value)}
          onRefresh={() => void handleRefresh('binance')}
        />
      </div>

      <Card title="Brecha cambiaria" className={styles.gapCard}>
        {gap ? (
          <div className={styles.gapContent}>
            <div className={styles.gapValues}>
              <div>
                <span className={styles.metricLabel}>Brecha porcentual</span>
                <strong className={styles.metricValue}>{formatPct(gap.pct, 2)}</strong>
              </div>
              <div>
                <span className={styles.metricLabel}>Brecha absoluta</span>
                <strong className={styles.metricValue}>{formatRate(gap.absoluteBs)} Bs.S</strong>
              </div>
            </div>
            {gap.abnormal && (
              <Badge tone="warning">Brecha anormalmente alta</Badge>
            )}
          </div>
        ) : (
          <p className={styles.gapHint}>
            Ingresa las tasas BCV y Binance para calcular la brecha cambiaria.
          </p>
        )}
      </Card>

      <p className={styles.footerNote}>
        La comisión por intervención es fija: 0,50% y no se puede editar.
      </p>
    </section>
  );
}
