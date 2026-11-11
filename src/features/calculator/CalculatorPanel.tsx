import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BankProfile,
  CalculationInput,
  CalculationMode,
  CalculationOptions,
  CalculationResult,
} from '../../domain/types';
import { calculate, getExchangeGap } from '../../domain/calculations';
import { useAppStore } from '../../store/useAppStore';
import { formatBs, formatPct, formatPctWithFixedUsd, formatRate, formatUsd } from '../../utils/format';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CopyButton } from '../../components/ui/CopyButton';
import { FilterChip } from '../../components/ui/FilterChip';
import { NumberField } from '../../components/ui/NumberField';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { WaterfallView } from './WaterfallView';
import styles from './CalculatorPanel.module.css';

const RATE_CONFIGURATION_HINT =
  'Configura la tasa BCV y la tasa Binance P2P en la pestaña Tasas.';

interface CalculationState {
  input: CalculationInput | null;
  result: CalculationResult | null;
  amountError: string | undefined;
  engineError: string | null;
  ratesConfigured: boolean;
}

interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

function optionsFromProfile(profile: BankProfile | null): CalculationOptions {
  return {
    interbankEnabled: profile?.interbankEnabled ?? false,
    igtfEnabled: profile?.igtfEnabled ?? false,
    slippageEnabled: profile?.slippageEnabled ?? false,
  };
}

function formatProfilePct(value: number): string {
  return formatPct(value, Number.isInteger(value) ? 0 : 2);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function displayRate(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${formatRate(value)} Bs.S/USD` : 'Sin configurar';
}

export function CalculatorPanel() {
  const profiles = useAppStore((state) => state.profiles);
  const rates = useAppStore((state) => state.rates);
  const recordPurchase = useAppStore((state) => state.recordPurchase);
  const [mode, setMode] = useState<CalculationMode>('bs');
  const [amountText, setAmountText] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [profileId, setProfileId] = useState(() => profiles[0]?.id ?? '');
  const [options, setOptions] = useState<CalculationOptions>(() =>
    optionsFromProfile(profiles[0] ?? null),
  );
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [registeredSignature, setRegisteredSignature] = useState<string | null>(null);
  const registeredSignatureRef = useRef<string | null>(null);

  const selectedProfile = profiles.find((profile) => profile.id === profileId) ?? profiles[0] ?? null;
  const selectedProfileId = selectedProfile?.id;

  useEffect(() => {
    if (profiles.length === 0) {
      if (profileId !== '') setProfileId('');
      return;
    }

    if (!profiles.some((profile) => profile.id === profileId)) {
      setProfileId(profiles[0].id);
    }
  }, [profiles, profileId]);

  useEffect(() => {
    setOptions(optionsFromProfile(selectedProfile));
  }, [selectedProfileId]);

  const ratesConfigured =
    Number.isFinite(rates.bcv.value) &&
    rates.bcv.value > 0 &&
    Number.isFinite(rates.binance.value) &&
    rates.binance.value > 0;

  const exchangeGap = useMemo(
    () =>
      ratesConfigured
        ? getExchangeGap(rates.bcv.value, rates.binance.value)
        : null,
    [rates.bcv.value, rates.binance.value, ratesConfigured],
  );

  const calculation = useMemo<CalculationState>(() => {
    const amount = amountText.trim() === '' ? Number.NaN : Number(amountText.replace(',', '.'));
    const amountError =
      !Number.isFinite(amount) || amount <= 0 ? 'Ingresa un monto válido mayor que 0.' : undefined;

    if (!selectedProfile || !ratesConfigured || amountError) {
      return {
        input: null,
        result: null,
        amountError,
        engineError: null,
        ratesConfigured,
      };
    }

    const input: CalculationInput = {
      mode,
      amount,
      bcvRate: rates.bcv.value,
      binanceRate: rates.binance.value,
      profile: selectedProfile,
      options,
    };

    try {
      return {
        input,
        result: calculate(input),
        amountError,
        engineError: null,
        ratesConfigured,
      };
    } catch (error) {
      return {
        input,
        result: null,
        amountError,
        engineError: getErrorMessage(error, 'No fue posible calcular la operación.'),
        ratesConfigured,
      };
    }
  }, [
    amountText,
    mode,
    options,
    rates.bcv.value,
    rates.binance.value,
    ratesConfigured,
    selectedProfile,
  ]);

  const referenceCalculation = useMemo<CalculationResult | null>(() => {
    if (!selectedProfile || !ratesConfigured) return null;

    const input: CalculationInput = {
      mode: 'usd',
      amount: 100,
      bcvRate: rates.bcv.value,
      binanceRate: rates.binance.value,
      profile: selectedProfile,
      options,
    };

    try {
      return calculate(input);
    } catch {
      return null;
    }
  }, [
    options,
    rates.bcv.value,
    rates.binance.value,
    ratesConfigured,
    selectedProfile,
  ]);

  const calculationSignature =
    calculation.input && calculation.result ? JSON.stringify(calculation.input) : null;
  const alreadyRegistered =
    calculationSignature !== null && registeredSignature === calculationSignature;

  useEffect(() => {
    setFeedback(null);
  }, [calculationSignature]);

  const clearFeedback = (): void => {
    setFeedback(null);
    setRegisteredSignature(null);
    registeredSignatureRef.current = null;
  };

  const handleProfileChange = (nextProfileId: string): void => {
    const nextProfile = profiles.find((profile) => profile.id === nextProfileId);
    if (!nextProfile) return;

    setProfileId(nextProfileId);
    setOptions(optionsFromProfile(nextProfile));
    clearFeedback();
  };

  const handleRegister = (): void => {
    const { input, result } = calculation;
    if (!input || !result || !calculationSignature) return;
    if (
      registeredSignatureRef.current === calculationSignature ||
      registeredSignature === calculationSignature
    ) {
      return;
    }

    setFeedback(null);
    registeredSignatureRef.current = calculationSignature;

    try {
      recordPurchase(input, notes.trim());
      setRegisteredSignature(calculationSignature);
      setNotes('');
      setFeedback({
        tone: 'success',
        message: 'Compra registrada en la pestaña Registros.',
      });
    } catch (error) {
      registeredSignatureRef.current = null;
      setRegisteredSignature(null);
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'No fue posible registrar la compra.'),
      });
    }
  };

  const amountHint = calculation.result
    ? mode === 'bs'
      ? `Equivalente estimado: ${formatUsd(calculation.result.usdBought)} acreditados en el banco antes de las comisiones de tarjeta.`
      : `Inversión estimada requerida: ${formatBs(calculation.result.amountBs)} en total, incluida la comisión por intervención.`
    : mode === 'bs'
      ? 'Ingresa Bs.S; los USD acreditados en el banco se calculan automáticamente con la tasa BCV.'
      : 'Ingresa los USD que quieres solicitar; el monto en Bs.S se calcula automáticamente con la tasa BCV.';

  const result = calculation.result;
  const referenceResult = result ? null : referenceCalculation;
  const waterfallLines =
    result?.waterfall ??
    referenceResult?.waterfall.map((line) => ({
      ...line,
      amountBs: line.amountBs === null ? null : 0,
      amountUsd: line.amountUsd === null ? null : 0,
    })) ??
    [];
  const breakEvenRate = result?.breakEvenRate ?? referenceResult?.breakEvenRate;
  const minGapPct = result?.minGapPct ?? referenceResult?.minGapPct;
  const amountValue = amountText.trim() === '' ? Number.NaN : Number(amountText.replace(',', '.'));
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const profitabilityTone =
    result?.profitability === 'green'
      ? 'success'
      : result?.profitability === 'yellow'
        ? 'warning'
        : result?.profitability === 'red'
          ? 'danger'
          : 'neutral';
  const profitabilityLabel =
    result?.profitability === 'green'
      ? 'Rentable'
      : result?.profitability === 'yellow'
        ? 'Margen bajo'
        : result?.profitability === 'red'
          ? 'No rentable'
          : !validAmount
            ? 'Sin monto'
            : !selectedProfile
              ? 'Sin perfil'
              : !calculation.ratesConfigured
                ? 'Sin tasas'
                : 'Sin cálculo';
  const waterfallHint = !selectedProfile
    ? 'Crea un perfil bancario para generar el desglose.'
    : !calculation.ratesConfigured
      ? 'Configura las tasas BCV y Binance P2P para ver el desglose.'
      : 'No fue posible generar el desglose con la configuración actual.';

  return (
    <section className={styles.panel} aria-label="Calculadora de arbitraje">
      {feedback && (
        <div
          className={feedback.tone === 'success' ? styles.successFeedback : styles.errorFeedback}
          role={feedback.tone === 'success' ? 'status' : 'alert'}
        >
          {feedback.message}
        </div>
      )}

      <div className={styles.calculatorColumn}>
        <Card title="Calculadora P2P" className={styles.calculatorCard}>
          <div className={styles.formContent}>
            <div className={styles.entryGrid}>
              {selectedProfile ? (
                <div className={styles.profileField}>
                  <SelectField
                    label="Perfil bancario"
                    name="calculator-profile"
                    value={selectedProfile.id}
                    onChange={handleProfileChange}
                    options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
                    hint="Los costos y comisiones de esta operación se toman de este perfil."
                  />
                  <div className={styles.profileQuickFacts} aria-label="Resumen del perfil bancario">
                    <span
                      className={styles.quickFact}
                      title={`Comisión de tarjeta sobre ${selectedProfile.cardCommissionBase === 'usd' ? 'USD' : 'Bs.S'}`}
                    >
                      Tarjeta: {formatProfilePct(selectedProfile.cardCommissionPct)}
                    </span>
                    <span className={styles.quickFact} title="Comisión de depósito Binance">
                      Binance:{' '}
                      {formatPctWithFixedUsd(
                        selectedProfile.binanceDepositPct,
                        selectedProfile.binanceDepositFixedUsd,
                        Number.isInteger(selectedProfile.binanceDepositPct) ? 0 : 2,
                      )}
                    </span>
                    <span className={styles.quickFact} title="Costo interbancario predeterminado">
                      Interbancario:{' '}
                      {selectedProfile.interbankEnabled
                        ? formatProfilePct(selectedProfile.interbankPct)
                        : 'off'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className={styles.rateHint} role="note">
                  No hay perfiles bancarios configurados. Crea uno en la pestaña Perfiles para registrar una operación.
                </p>
              )}

              <div className={styles.modeField}>
                <span className={styles.fieldLabel}>Modo de entrada</span>
                <div className={styles.modeSelector} role="group" aria-label="Modo de cálculo">
                  <button
                    className={`${styles.modeButton} ${mode === 'bs' ? styles.modeButtonActive : ''}`}
                    type="button"
                    aria-pressed={mode === 'bs'}
                    onClick={() => {
                      if (mode === 'bs') return;
                      clearFeedback();
                      setMode('bs');
                    }}
                  >
                    Invertir Bs.S
                  </button>
                  <button
                    className={`${styles.modeButton} ${mode === 'usd' ? styles.modeButtonActive : ''}`}
                    type="button"
                    aria-pressed={mode === 'usd'}
                    onClick={() => {
                      if (mode === 'usd') return;
                      clearFeedback();
                      setMode('usd');
                    }}
                  >
                    Solicitar USD
                  </button>
                </div>
              </div>

              <NumberField
                label={mode === 'bs' ? 'Monto a invertir' : 'Monto de USD a solicitar'}
                name="calculator-amount"
                value={amountText}
                onChange={(value) => {
                  clearFeedback();
                  setAmountText(value);
                  setAmountTouched(true);
                }}
                suffix={mode === 'bs' ? 'Bs.S' : 'USD'}
                step="any"
                placeholder={mode === 'bs' ? 'Ej.: 2500,00' : 'Ej.: 100,00'}
                error={amountTouched ? calculation.amountError : undefined}
                hint={amountHint}
              />
            </div>

            <dl className={styles.rateSummary} aria-label="Tasas actuales">
              <div className={styles.rateItem}>
                <dt>Tasa BCV</dt>
                <dd>{displayRate(rates.bcv.value)}</dd>
              </div>
              <div className={styles.rateItem}>
                <dt>Binance P2P</dt>
                <dd>{displayRate(rates.binance.value)}</dd>
              </div>
              {exchangeGap && (
                <div className={`${styles.rateItem} ${styles.rateItemFull}`}>
                  <dt>Brecha actual (vs BCV + 0,50%)</dt>
                  <dd>
                    {formatPct(exchangeGap.pct, 2)}
                    <span className={styles.rateDetail}>
                      ({formatRate(exchangeGap.absoluteBs)} Bs.S)
                    </span>
                  </dd>
                </div>
              )}
            </dl>

            {!calculation.ratesConfigured && (
              <p className={styles.rateHint} role="note">
                {RATE_CONFIGURATION_HINT}
              </p>
            )}
            {calculation.engineError && (
              <p className={styles.errorFeedback} role="alert">
                {calculation.engineError}
              </p>
            )}

            {selectedProfile && (
              <div className={styles.optionalCostSection}>
                <span className={styles.fieldLabel}>Costos opcionales para este cálculo</span>
                <div className={styles.toggleGrid}>
                  <FilterChip
                    label={`Interbancario ${formatProfilePct(selectedProfile.interbankPct)}`}
                    active={options.interbankEnabled}
                    title="Alterna el costo interbancario para este cálculo"
                    onToggle={() => {
                      clearFeedback();
                      setOptions((current) => ({
                        ...current,
                        interbankEnabled: !current.interbankEnabled,
                      }));
                    }}
                  />
                  {selectedProfile.igtfEnabled && (
                    <FilterChip
                      label={`IGTF ${formatProfilePct(selectedProfile.igtfPct)}`}
                      active={options.igtfEnabled}
                      title="Alterna el IGTF para este cálculo"
                      onToggle={() => {
                        clearFeedback();
                        setOptions((current) => ({
                          ...current,
                          igtfEnabled: !current.igtfEnabled,
                        }));
                      }}
                    />
                  )}
                  {selectedProfile.slippageEnabled && (
                    <FilterChip
                      label={`Slippage ${formatProfilePct(selectedProfile.slippagePct)}`}
                      active={options.slippageEnabled}
                      title="Alterna el slippage para este cálculo"
                      onToggle={() => {
                        clearFeedback();
                        setOptions((current) => ({
                          ...current,
                          slippageEnabled: !current.slippageEnabled,
                        }));
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            <p className={styles.fixedFeeNote}>
              La comisión por intervención es fija: 0,50% del monto en Bs.S (no editable).
            </p>

            <TextField
              label="Notas de la compra (opcional)"
              name="calculator-notes"
              value={notes}
              onChange={(value) => {
                clearFeedback();
                setNotes(value);
              }}
              placeholder="Agrega una referencia para este registro"
            />

            <div className={styles.actionRow}>
              <Button
                className={styles.registerButton}
                onClick={handleRegister}
                disabled={!calculation.input || !result || alreadyRegistered}
              >
                Registrar compra
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.receiptColumn}>
        <Card title="Resumen de la Operación" className={styles.resultsCard}>
          <div className={styles.receiptContent}>
            {!calculation.ratesConfigured && (
              <p className={styles.receiptHint} role="note">
                Configura ambas tasas para calcular resultados y break-even.
              </p>
            )}

            <div className={styles.heroGrid}>
              <article
                className={styles.heroMetric}
                title="Monto en Bs.S dedicado a la compra BCV + 0,50%."
              >
                <span className={styles.metricLabel}>Inversión</span>
                <strong className={styles.heroValue}>{formatBs(result?.bcvPurchaseBs ?? 0)}</strong>
              </article>
              <article
                className={`${styles.heroMetric} ${styles.secondaryMetric}`}
                title="Total en Bs.S esperado por la venta de las divisas."
              >
                <span className={styles.metricLabel}>Retorno</span>
                <div className={styles.heroValueRow}>
                  <strong className={styles.heroValue}>{formatBs(result?.bsOut ?? 0)}</strong>
                  <CopyButton
                    value={(result?.bsOut ?? 0).toFixed(2)}
                    label="retorno en Bs.S"
                    disabled={!result}
                  />
                </div>
              </article>
              <article
                className={styles.heroMetric}
                title="Total de divisas adquiridas en el banco."
              >
                <span className={styles.metricLabel}>USD Adjudicados</span>
                <strong className={styles.heroValue}>{formatUsd(result?.usdBought ?? 0)}</strong>
              </article>
              <article
                className={`${styles.heroMetric} ${styles.primaryMetric}`}
                title="USD máximos para depositar en Binance, después de la comisión de la tarjeta."
              >
                <span className={styles.metricLabel}>Monto a Ingresar en Binance</span>
                <div className={styles.heroValueRow}>
                  <strong className={styles.heroValue} data-testid="binance-amount">
                    {formatUsd(result?.usdForBinance ?? 0)}
                  </strong>
                  <CopyButton
                    value={(result?.usdForBinance ?? 0).toFixed(2)}
                    label="monto a ingresar en Binance"
                    disabled={!result}
                  />
                </div>
              </article>
            </div>

            <div className={styles.profitabilitySummary}>
              <span className={styles.trafficLight} data-testid="traffic-light">
                <Badge tone={profitabilityTone}>{profitabilityLabel}</Badge>
              </span>
              <p className={styles.profitabilityLegend}>
                Verde &gt; 3% · Amarillo &gt; 0% · Rojo ≤ 0%
              </p>
            </div>

            <div className={styles.receiptSeparator} aria-hidden="true" />

            <div className={styles.resultGrid}>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Punto de equilibrio (tasa mínima de venta)</span>
                <strong className={styles.metricValue} data-testid="break-even-rate">
                  {breakEvenRate === undefined ? '—' : `${formatRate(breakEvenRate)} Bs.S/USD`}
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Brecha mínima requerida</span>
                <strong className={styles.metricValue} data-testid="min-gap">
                  {minGapPct === undefined ? '—' : formatPct(minGapPct, 2)}
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Utilidad neta</span>
                <strong
                  className={`${styles.metricValue} ${result ? (result.netProfitBs < 0 ? styles.negativeValue : styles.positiveValue) : ''}`}
                  data-testid="net-profit"
                >
                  {formatBs(result?.netProfitBs ?? 0)}
                </strong>
                <span className={styles.metricDetail}>ROI: {formatPct(result?.roiPct ?? 0, 2)}</span>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Costo total real</span>
                <strong className={styles.metricValue}>{formatBs(result?.totalCostBs ?? 0)}</strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>USDT netos en billetera</span>
                <strong className={styles.metricValue}>{formatUsd(result?.usdtNet ?? 0)}</strong>
              </article>
            </div>

            {result && result.netProfitBs < 0 && (
              <div className={styles.lossBanner} role="alert">
                La utilidad neta es negativa: la operación perdería{' '}
                {formatBs(Math.abs(result.netProfitBs))} con estas tasas y comisiones. Verifica el
                break-even antes de operar.
              </div>
            )}
          </div>
        </Card>

        <Card title="Desglose del cálculo (waterfall)" className={styles.waterfallCard}>
          {waterfallLines.length > 0 ? (
            <WaterfallView lines={waterfallLines} />
          ) : (
            <p className={styles.waterfallHint} role="note">
              {waterfallHint}
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}
