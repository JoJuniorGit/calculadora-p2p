import { useEffect, useRef, useState } from 'react';
import type { MultiRateSource } from '../../domain/types';
import { calculateMultiRateConversion } from '../../domain/calculations';
import { formatAmount, formatPct, formatRate } from '../../utils/format';
import { atmInputToValue, formatAtmDisplay, nextAtmValue } from '../../utils/atmInput';
import { useAppStore } from '../../store/useAppStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import {
  buildEquivalenceMetrics,
  CONVERTER_RATE_OPTIONS,
  DEFAULT_CONVERTER_SLOT_RATES,
  formatClipboardValue,
  getOptionRateValue,
  getRateDescriptor,
  parseAmountInput,
  swapConverterSlotRate,
  swapConverterSlots,
  type ConverterRateOption,
  type ConverterSlot,
} from './rateConverter';
import styles from './RateConverterPanel.module.css';

const QUICK_AMOUNTS = [1, 5, 10, 20, 50, 100, 500];
const REFERENCE_USD = 100;

const RAW_INPUTS_EMPTY: Record<MultiRateSource, string> = {
  VES: '',
  SLOT_1: '',
  SLOT_2: '',
};

const SOURCE_FIELD_NAMES: Record<MultiRateSource, string> = {
  VES: 'converter-ves',
  SLOT_1: 'converter-slot-1',
  SLOT_2: 'converter-slot-2',
};

interface ConverterCardConfig {
  source: MultiRateSource;
  title: string;
  unit: string;
  slot?: ConverterSlot;
}

function CopyIcon() {
  return (
    <svg
      className={styles.copyIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function RateConverterPanel() {
  const rates = useAppStore((state) => state.rates);
  const [slotRates, setSlotRates] = useState(DEFAULT_CONVERTER_SLOT_RATES);
  const [activeSource, setActiveSource] = useState<MultiRateSource>('VES');
  const [rawInputs, setRawInputs] =
    useState<Record<MultiRateSource, string>>(RAW_INPUTS_EMPTY);
  const [copiedSource, setCopiedSource] = useState<MultiRateSource | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const replaceOnEditRef = useRef(false);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const descriptor1 = getRateDescriptor(slotRates.SLOT_1);
  const descriptor2 = getRateDescriptor(slotRates.SLOT_2);
  const rate1 = getOptionRateValue(slotRates.SLOT_1, rates);
  const rate2 = getOptionRateValue(slotRates.SLOT_2, rates);
  const ratesReady = rate1 > 0 && rate2 > 0;
  const activeAmount = parseAmountInput(rawInputs[activeSource]);
  const result =
    ratesReady && activeAmount !== null
      ? calculateMultiRateConversion(activeSource, activeAmount, rate1, rate2)
      : null;

  const hasLiveAmount = result !== null && activeAmount !== null && activeAmount > 0;
  const referenceResult = ratesReady
    ? calculateMultiRateConversion('SLOT_1', REFERENCE_USD, rate1, rate2)
    : null;
  const effectiveResult = hasLiveAmount ? result : referenceResult;
  const effectiveSource: MultiRateSource = hasLiveAmount ? activeSource : 'SLOT_1';
  const usingReference = !hasLiveAmount;
  const metrics = effectiveResult
    ? buildEquivalenceMetrics(effectiveSource, effectiveResult, rate1, rate2)
    : null;

  const cards: ConverterCardConfig[] = [
    { source: 'VES', title: 'Bolívares', unit: 'Bs.S' },
    { source: 'SLOT_1', title: descriptor1.cardTitle, unit: descriptor1.unit, slot: 'SLOT_1' },
    { source: 'SLOT_2', title: descriptor2.cardTitle, unit: descriptor2.unit, slot: 'SLOT_2' },
  ];

  const displayedValue = (source: MultiRateSource): string => {
    if (source === activeSource) {
      return rawInputs[source].trim() === '' ? '' : formatAtmDisplay(rawInputs[source]);
    }
    if (!result) return '';
    if (source === 'VES') return formatAmount(result.vesAmount);
    if (source === 'SLOT_1') return formatAmount(result.slot1Usd);
    return formatAmount(result.slot2Usd);
  };

  const valueForSource = (source: MultiRateSource): number | null => {
    if (source === activeSource) return parseAmountInput(rawInputs[source]);
    if (!result) return null;
    if (source === 'VES') return result.vesAmount;
    if (source === 'SLOT_1') return result.slot1Usd;
    return result.slot2Usd;
  };

  const handleFocus = (source: MultiRateSource, input: HTMLInputElement): void => {
    if (source !== activeSource) {
      setActiveSource(source);
      const value = valueForSource(source);
      setRawInputs((current) => ({
        ...current,
        [source]: value === null ? '' : value.toFixed(2),
      }));
    }

    replaceOnEditRef.current = true;
    input.select();
    window.requestAnimationFrame(() => {
      if (document.activeElement === input) input.select();
    });
  };

  const handleAmountChange = (source: MultiRateSource, text: string): void => {
    const replacing = replaceOnEditRef.current;
    replaceOnEditRef.current = false;
    setActiveSource(source);
    setRawInputs((current) => {
      if (!replacing) {
        return {
          ...current,
          [source]: nextAtmValue(displayedValue(source), text),
        };
      }

      const previous = displayedValue(source);
      const typed =
        previous !== '' && text.length > previous.length && text.startsWith(previous)
          ? text.slice(previous.length)
          : text;

      return { ...current, [source]: atmInputToValue(typed) };
    });
  };

  const handleQuickAmount = (amount: number): void => {
    const target: ConverterSlot = activeSource === 'SLOT_2' ? 'SLOT_2' : 'SLOT_1';
    setActiveSource(target);
    setRawInputs((current) => ({ ...current, [target]: amount.toFixed(2) }));
  };

  const handleClear = (): void => {
    setRawInputs({ ...RAW_INPUTS_EMPTY });
  };

  const handleSlotRateChange = (
    slot: ConverterSlot,
    option: ConverterRateOption,
  ): void => {
    setSlotRates((current) => swapConverterSlotRate(slot, option, current));
  };

  const handleSwapRates = (): void => {
    setSlotRates((current) => swapConverterSlots(current));
  };

  const handleCopy = async (source: MultiRateSource): Promise<void> => {
    const value = valueForSource(source);
    if (value === null) return;

    try {
      await navigator.clipboard.writeText(formatClipboardValue(value));
    } catch {
      // Clipboard can be unavailable (permissions/insecure context); feedback
      // still confirms the attempted copy of the on-screen value.
    }

    setCopiedSource(source);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedSource(null), 1500);
  };

  const isQuickAmountActive = (amount: number): boolean =>
    activeSource !== 'VES' && parseAmountInput(rawInputs[activeSource]) === amount;

  const savingsBadge =
    effectiveResult && metrics
      ? effectiveResult.slot2Usd <= effectiveResult.slot1Usd
        ? `Ahorras ${formatAmount(metrics.savingsUsd)} ${descriptor2.unit} (${formatPct(metrics.savingsPct)})`
        : `Costo adicional ${formatAmount(metrics.savingsUsd)} ${descriptor2.unit} (${formatPct(metrics.savingsPct)})`
      : '';

  const powerBadge =
    effectiveResult && metrics
      ? effectiveResult.slot1Usd >= effectiveResult.slot2Usd
        ? `+${formatAmount(metrics.purchasingPowerUsd)} USD de poder de compra`
        : `−${formatAmount(metrics.purchasingPowerUsd)} USD de poder de compra`
      : '';

  return (
    <section className={styles.panel} aria-label="Conversor de tasas reactivo">
      <header className={styles.panelHeader}>
        <span className={styles.headerSpacer} aria-hidden="true" />
        <div className={styles.panelHeading}>
          <div className={styles.titleRow}>
            <h1 className={styles.panelTitle}>Conversor de Tasas</h1>
            <span className={styles.titleTooltip}>
              <InfoTooltip
                label="Cómo funciona el conversor de tasas"
                content="Convierte entre bolívares y hasta dos tasas simultáneas. El campo que edites es la base de cálculo y los otros dos se recalculan al instante."
                align="end"
              />
            </span>
          </div>
        </div>
        <Button
          variant="secondary"
          className={styles.swapButton}
          onClick={handleSwapRates}
          aria-label="Intercambiar tasas de los slots"
          title="Intercambiar tasas"
        >
          ⇄
        </Button>
      </header>

      <div className={styles.quickRow}>
        <span className={styles.quickLabel}>Montos rápidos</span>
        {QUICK_AMOUNTS.map((amount) => (
          <Button
            key={amount}
            variant="secondary"
            className={`${styles.quickButton} ${
              isQuickAmountActive(amount) ? styles.quickButtonActive : ''
            }`}
            onClick={() => handleQuickAmount(amount)}
            aria-pressed={isQuickAmountActive(amount)}
          >
            ${amount}
          </Button>
        ))}
        <Button variant="ghost" className={styles.clearButton} onClick={handleClear}>
          Limpiar
        </Button>
      </div>

      <div className={styles.grid}>
        {cards.map(({ source, title, unit, slot }) => {
          const isBase = activeSource === source;
          const slotOption = slot ? slotRates[slot] : null;
          const slotRate = slot ? getOptionRateValue(slotOption as ConverterRateOption, rates) : 0;

          return (
            <Card
              key={source}
              title={title}
              className={`${styles.card} ${isBase ? styles.cardBase : ''}`}
              actions={
                <div className={styles.cardActions}>
                  <Badge tone={isBase ? 'info' : 'neutral'}>
                    {isBase ? 'Base de cálculo' : 'Calculado'}
                  </Badge>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => void handleCopy(source)}
                    disabled={valueForSource(source) === null}
                    aria-label={
                      copiedSource === source
                        ? `Copiado: ${title}`
                        : `Copiar valor de ${title}`
                    }
                    title={copiedSource === source ? 'Copiado' : 'Copiar'}
                  >
                    {copiedSource === source ? (
                      <span aria-hidden="true">✓</span>
                    ) : (
                      <CopyIcon />
                    )}
                  </button>
                </div>
              }
            >
              <div className={styles.cardBody}>
                <div className={styles.rateBar}>
                  {slot && slotOption ? (
                    <>
                      <select
                        className={styles.rateSelect}
                        name={`${SOURCE_FIELD_NAMES[source]}-rate`}
                        value={slotOption}
                        onChange={(event) =>
                          handleSlotRateChange(
                            slot,
                            event.target.value as ConverterRateOption,
                          )
                        }
                        aria-label={`Tasa del ${title}`}
                      >
                        {CONVERTER_RATE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className={styles.rateValue}>
                        {slotRate > 0
                          ? `${formatRate(slotRate)} Bs.S/${unit}`
                          : 'Sin configurar'}
                      </span>
                    </>
                  ) : (
                    <span className={styles.pivotPill}>
                      Moneda local · Pivote de conversión
                    </span>
                  )}
                </div>

                <div className={styles.inputShell}>
                  <input
                    className={styles.amountInput}
                    type="text"
                    inputMode="numeric"
                    name={SOURCE_FIELD_NAMES[source]}
                    value={displayedValue(source)}
                    onFocus={(event) => handleFocus(source, event.currentTarget)}
                    onChange={(event) => handleAmountChange(source, event.target.value)}
                    aria-label={`Monto en ${unit}`}
                    placeholder="0,00"
                    autoComplete="off"
                  />
                  <span className={styles.currencyBadge}>{unit}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <section className={styles.equivalence} aria-label="Equivalencia y poder de compra">
        <div className={styles.equivalenceHeader}>
          <h2 className={styles.equivalenceTitle}>Equivalencia y poder de compra</h2>
          {usingReference && (
            <span className={styles.referenceTag}>
              Referencia por cada $100 {descriptor1.unit}
            </span>
          )}
        </div>

        {effectiveResult && metrics ? (
          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <h3>Liquidación P2P necesaria</h3>
              <p>
                Para pagar {formatAmount(effectiveResult.slot1Usd)} {descriptor1.unit}{' '}
                ({descriptor1.label}) en un comercio, solo necesitas vender{' '}
                {formatAmount(effectiveResult.slot2Usd)} {descriptor2.unit} (
                {descriptor2.label}).
              </p>
              <Badge tone="success">{savingsBadge}</Badge>
            </article>

            <article className={styles.metricCard}>
              <h3>Poder de compra extra</h3>
              <p>
                Vender {formatAmount(effectiveResult.slot2Usd)} {descriptor2.unit} (
                {descriptor2.label}) equivale a comprar{' '}
                {formatAmount(effectiveResult.slot1Usd)} {descriptor1.unit} (
                {descriptor1.label}).
              </p>
              <Badge tone="info">{powerBadge}</Badge>
            </article>

            <article className={styles.metricCard}>
              <h3>Diferencial en bolívares</h3>
              <p className={styles.deltaValue}>
                Δ Bs.S: {formatAmount(metrics.deltaBs)}
              </p>
              <span className={styles.metricNote}>
                Diferencia: {formatAmount(effectiveResult.usdDifference)} USD
              </span>
            </article>
          </div>
        ) : (
          <p className={styles.equivalenceText}>
            Configura ambas tasas para ver la equivalencia y el poder de compra.
          </p>
        )}
      </section>
    </section>
  );
}
