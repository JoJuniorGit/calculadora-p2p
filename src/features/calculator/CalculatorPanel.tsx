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
import { formatBs, formatPct, formatRate, formatUsd } from '../../utils/format';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { NumberField } from '../../components/ui/NumberField';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { ToggleField } from '../../components/ui/ToggleField';
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

function summarizeProfile(profile: BankProfile): string {
  const cardBase = profile.cardCommissionBase === 'usd' ? 'USD' : 'Bs.S';
  const toggleState = (enabled: boolean): string => (enabled ? 'activado' : 'desactivado');

  return `Perfil ${profile.name}: comisión de tarjeta ${formatProfilePct(profile.cardCommissionPct)} sobre ${cardBase}; depósito Binance ${formatProfilePct(profile.binanceDepositPct)} + ${formatUsd(profile.binanceDepositFixedUsd)}. Por defecto, interbancario ${toggleState(profile.interbankEnabled)}, IGTF ${toggleState(profile.igtfEnabled)} y slippage ${toggleState(profile.slippageEnabled)}. Puedes ajustar estos interruptores solo para este cálculo.`;
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

  if (!selectedProfile) {
    return (
      <section className={styles.panel} aria-label="Calculadora de arbitraje">
        <EmptyState
          title="No hay perfiles bancarios configurados"
          description="Crea un perfil bancario en la pestaña Perfiles antes de usar la calculadora."
        />
      </section>
    );
  }

  const amountHint = calculation.result
    ? mode === 'bs'
      ? `Equivalente estimado: ${formatUsd(calculation.result.usdBought)} acreditados en el banco antes de las comisiones de tarjeta.`
      : `Inversión estimada requerida: ${formatBs(calculation.result.amountBs)} en total, incluida la comisión por intervención.`
    : mode === 'bs'
      ? 'Ingresa Bs.S; los USD acreditados en el banco se calculan automáticamente con la tasa BCV.'
      : 'Ingresa los USD que quieres solicitar; el monto en Bs.S se calcula automáticamente con la tasa BCV.';

  const result = calculation.result;
  const profitabilityTone =
    result?.profitability === 'green'
      ? 'success'
      : result?.profitability === 'yellow'
        ? 'warning'
        : 'danger';
  const profitabilityLabel =
    result?.profitability === 'green'
      ? 'Rentable'
      : result?.profitability === 'yellow'
        ? 'Margen bajo'
        : 'No rentable';

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

      <Card title="Calculadora P2P" className={styles.calculatorCard}>
        <div className={styles.formContent}>
          <div className={styles.entryGrid}>
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
              }}
              suffix={mode === 'bs' ? 'Bs.S' : 'USD'}
              step="any"
              placeholder={mode === 'bs' ? 'Ej.: 2500,00' : 'Ej.: 100,00'}
              error={calculation.amountError}
              hint={amountHint}
            />

            <div className={styles.profileField}>
              <SelectField
                label="Perfil bancario"
                name="calculator-profile"
                value={selectedProfile.id}
                onChange={handleProfileChange}
                options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
                hint={summarizeProfile(selectedProfile)}
              />
            </div>
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
              <div className={styles.rateItem}>
                <dt>Brecha actual</dt>
                <dd>
                  {formatPct(exchangeGap.pct, 2)}
                  <span className={styles.rateDetail}>({formatRate(exchangeGap.absoluteBs)} Bs.S)</span>
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

          <div className={styles.toggleGrid}>
            <ToggleField
              label={`Costo interbancario (${formatProfilePct(selectedProfile.interbankPct)})`}
              checked={options.interbankEnabled}
              onChange={(checked) => {
                clearFeedback();
                setOptions((current) => ({ ...current, interbankEnabled: checked }));
              }}
            />
            <ToggleField
              label={`IGTF (${formatProfilePct(selectedProfile.igtfPct)})`}
              checked={options.igtfEnabled}
              onChange={(checked) => {
                clearFeedback();
                setOptions((current) => ({ ...current, igtfEnabled: checked }));
              }}
            />
            <ToggleField
              label={`Slippage (${formatProfilePct(selectedProfile.slippagePct)})`}
              checked={options.slippageEnabled}
              onChange={(checked) => {
                clearFeedback();
                setOptions((current) => ({ ...current, slippageEnabled: checked }));
              }}
            />
          </div>

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

      {result && (
        <>
          {result.netProfitBs < 0 && (
            <div className={styles.lossBanner} role="alert">
              La utilidad neta es negativa: la operación perdería {formatBs(Math.abs(result.netProfitBs))} con estas tasas y comisiones. Verifica el break-even antes de operar.
            </div>
          )}

          <Card title="Resultado de la operación" className={styles.resultsCard}>
            <div className={styles.profitabilitySummary}>
              <span className={styles.trafficLight} data-testid="traffic-light">
                <Badge tone={profitabilityTone}>{profitabilityLabel}</Badge>
              </span>
              <p className={styles.profitabilityLegend}>
                Verde &gt; 3% · Amarillo &gt; 0% · Rojo ≤ 0%
              </p>
            </div>

            <div className={styles.resultGrid}>
              <article className={`${styles.metricCard} ${styles.primaryMetric}`}>
                <span className={styles.metricLabel}>Monto exacto a digitar en Binance</span>
                <strong className={styles.metricValue} data-testid="binance-amount">
                  {formatUsd(result.usdForBinance)}
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>
                  Punto de equilibrio (tasa mínima de venta)
                </span>
                <strong className={styles.metricValue} data-testid="break-even-rate">
                  {formatRate(result.breakEvenRate)} Bs.S/USD
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Brecha mínima requerida</span>
                <strong className={styles.metricValue} data-testid="min-gap">
                  {formatPct(result.minGapPct)}
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Costo total real</span>
                <strong className={styles.metricValue}>{formatBs(result.totalCostBs)}</strong>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Utilidad neta</span>
                <strong
                  className={`${styles.metricValue} ${result.netProfitBs < 0 ? styles.negativeValue : styles.positiveValue}`}
                  data-testid="net-profit"
                >
                  {formatBs(result.netProfitBs)}
                </strong>
                <span className={styles.metricDetail}>ROI: {formatPct(result.roiPct)}</span>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>USDT netos en billetera</span>
                <strong className={styles.metricValue}>{formatUsd(result.usdDeposited)}</strong>
              </article>
            </div>
          </Card>

          <Card title="Desglose del cálculo (waterfall)" className={styles.waterfallCard}>
            <WaterfallView lines={result.waterfall} />
          </Card>
        </>
      )}
    </section>
  );
}
