import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BankProfile,
  CalculationInput,
  CalculationMode,
  CalculationOptions,
  CalculationResult,
  PurchaseRateReference,
  PurchaseRecordMetadata,
} from '../../domain/types';
import { calculate, DEFAULT_P2P_FIXED_FEE_USDT, getExchangeGap } from '../../domain/calculations';
import { useAppStore } from '../../store/useAppStore';
import {
  formatBs,
  formatDateOnly,
  formatPct,
  formatPctWithFixedUsd,
  formatRate,
  formatUsd,
} from '../../utils/format';
import {
  fetchHistoricalRateForDate,
  type HistoricalRateForDate,
} from '../rates/ratesApi';
import { describeRateFailure, useAutoRateRefresh } from '../rates/useAutoRateRefresh';
import { formatRateAge, getRateAgeMs, isRateStale } from '../rates/rateStaleness';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CopyButton } from '../../components/ui/CopyButton';
import { FilterChip } from '../../components/ui/FilterChip';
import { Modal } from '../../components/ui/Modal';
import { NumberField } from '../../components/ui/NumberField';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { WaterfallView } from './WaterfallView';
import styles from './CalculatorPanel.module.css';

const RATE_CONFIGURATION_HINT =
  'Configura la tasa BCV y la tasa Binance P2P en la pestaña Tasas.';

export const CALCULATION_MODE_STORAGE_KEY = 'calculadora-p2p:calculation-mode';
export const BANK_PROFILE_STORAGE_KEY = 'calculadora-p2p:bank-profile';

function isCalculationMode(value: string): value is CalculationMode {
  return value === 'bs' || value === 'usd';
}

function readStoredCalculationMode(): CalculationMode {
  try {
    if (typeof window === 'undefined') return 'bs';
    const stored = window.localStorage.getItem(CALCULATION_MODE_STORAGE_KEY);
    return stored !== null && isCalculationMode(stored) ? stored : 'bs';
  } catch {
    return 'bs';
  }
}

function persistCalculationMode(mode: CalculationMode): void {
  try {
    window.localStorage.setItem(CALCULATION_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private/full modes; the mode remains in memory.
  }
}

function readStoredBankProfileId(profiles: readonly BankProfile[]): string {
  const fallback = profiles[0]?.id ?? '';
  try {
    if (typeof window === 'undefined') return fallback;
    const stored = window.localStorage.getItem(BANK_PROFILE_STORAGE_KEY);
    return stored !== null && profiles.some((profile) => profile.id === stored)
      ? stored
      : fallback;
  } catch {
    return fallback;
  }
}

function persistBankProfileId(profileId: string): void {
  try {
    if (profileId === '') return;
    window.localStorage.setItem(BANK_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // Storage can be unavailable in private/full modes; the selection remains in memory.
  }
}

interface CalculationState {
  input: CalculationInput | null;
  result: CalculationResult | null;
  amountError: string | undefined;
  dateError: string | undefined;
  engineError: string | null;
  ratesConfigured: boolean;
}

interface HistoricalRateDraft {
  bcv: string;
  binance: string;
  editedBcv: boolean;
  editedBinance: boolean;
}

type HistoricalRateLookup =
  | { status: 'idle' }
  | { status: 'loading'; date: string }
  | {
      status: 'loaded';
      date: string;
      rates: HistoricalRateForDate;
      draft: HistoricalRateDraft;
    }
  | {
      status: 'error';
      date: string;
      message: string;
      draft: HistoricalRateDraft;
    };

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

function getLocalDateStamp(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function getPurchaseDateError(value: string, today: string): string | undefined {
  if (!value) return 'Selecciona la fecha de compra.';
  if (!isValidDateOnly(value)) return 'La fecha de compra no es válida.';
  if (value > today) return 'La fecha de compra no puede ser futura.';
  return undefined;
}

function parsePositiveRate(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const rate = Number(normalized);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function createHistoricalRateDraft(rates: HistoricalRateForDate): HistoricalRateDraft {
  return {
    bcv: String(rates.bcv.value),
    binance: String(rates.binance.value),
    editedBcv: false,
    editedBinance: false,
  };
}

function getRateReferenceForDate(
  date: string,
  lookup: HistoricalRateLookup,
): PurchaseRateReference | undefined {
  if (lookup.status === 'loaded' && lookup.date === date) {
    const { draft, rates } = lookup;
    const editedBcv = draft.editedBcv;
    const editedBinance = draft.editedBinance;
    const wasEdited = editedBcv || editedBinance;

    return {
      source: wasEdited ? 'manual' : 'historical',
      bcvAsOf: editedBcv ? date : rates.bcv.capturedAt,
      bcvForwardFilled: editedBcv ? false : rates.bcv.forwardFilled,
      binanceAsOf: editedBinance ? null : rates.binance.capturedAt,
      binanceMethod: editedBinance ? 'manual' : rates.binance.method,
    };
  }

  if (lookup.status === 'error' && lookup.date === date) {
    return {
      source: 'manual',
      bcvAsOf: date,
      bcvForwardFilled: false,
      binanceAsOf: null,
      binanceMethod: 'manual',
    };
  }

  return undefined;
}

function displayRate(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${formatRate(value)} Bs.S/USD` : 'Sin configurar';
}

interface HeroSummaryProps {
  result: CalculationResult | null;
  profitabilityTone: 'success' | 'warning' | 'danger' | 'neutral';
  profitabilityLabel: string;
  className: string;
  testId?: string;
}

function HeroSummary({
  result,
  profitabilityTone,
  profitabilityLabel,
  className,
  testId,
}: HeroSummaryProps) {
  return (
    <div className={`${styles.heroSummary} ${className}`} data-testid={testId}>
      <div className={styles.heroGrid}>
        <article
          className={styles.heroMetric}
          title="Monto en Bs.S dedicado a la compra BCV + 0,50%."
        >
          <span className={styles.metricLabel}>Inversión</span>
          <div className={styles.heroValueRow}>
            <strong className={styles.heroValue}>{formatBs(result?.bcvPurchaseBs ?? 0)}</strong>
            <CopyButton
              value={(result?.bcvPurchaseBs ?? 0).toFixed(2)}
              label="inversión en Bs.S"
              disabled={!result}
            />
          </div>
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
    </div>
  );
}

export function CalculatorPanel() {
  const profiles = useAppStore((state) => state.profiles);
  const rates = useAppStore((state) => state.rates);
  const recordPurchase = useAppStore((state) => state.recordPurchase);
  const [mode, setMode] = useState<CalculationMode>(readStoredCalculationMode);
  const [amountText, setAmountText] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [profileId, setProfileId] = useState(() => readStoredBankProfileId(profiles));
  const [options, setOptions] = useState<CalculationOptions>(() =>
    optionsFromProfile(
      profiles.find((profile) => profile.id === profileId) ?? profiles[0] ?? null,
    ),
  );
  const [notes, setNotes] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(getLocalDateStamp);
  const [historicalRateLookup, setHistoricalRateLookup] =
    useState<HistoricalRateLookup>({ status: 'idle' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmRegisterOpen, setConfirmRegisterOpen] = useState(false);
  const [registeredSignature, setRegisteredSignature] = useState<string | null>(null);
  const registeredSignatureRef = useRef<string | null>(null);
  const historicalRequestRef = useRef<{
    date: string;
    promise: Promise<HistoricalRateForDate>;
  } | null>(null);

  const today = getLocalDateStamp();
  const isTodayDate = purchaseDate === today;
  const isPastDate = purchaseDate !== '' && purchaseDate < today;
  const dateError = getPurchaseDateError(purchaseDate, today);
  const selectedProfile = profiles.find((profile) => profile.id === profileId) ?? profiles[0] ?? null;
  const selectedProfileId = selectedProfile?.id;
  const amountValue =
    amountText.trim() === '' ? Number.NaN : Number(amountText.replace(',', '.'));
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const autoRateRefresh = useAutoRateRefresh(
    isTodayDate && validAmount ? amountText.trim() : null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const staleP2pWarning = useMemo(() => {
    if (!isTodayDate) return null;
    if (!isRateStale(rates.binance, nowMs)) return null;

    const failure = autoRateRefresh.failures.find((item) => item.key === 'binance');
    if (!failure) return null;

    const ageMs = getRateAgeMs(rates.binance, nowMs);
    const ageLabel = ageMs === null ? 'más de 10 minutos' : formatRateAge(ageMs);

    return {
      title: 'Tasas P2P desactualizadas',
      message: `La tasa Binance P2P lleva ${ageLabel} sin actualizarse y el último intento automático falló: ${describeRateFailure(
        failure,
      )}. Se sigue usando el último valor guardado; revisa tu conexión y vuelve a intentarlo.`,
    };
  }, [autoRateRefresh.failures, isTodayDate, nowMs, rates.binance]);

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

  useEffect(() => {
    persistCalculationMode(mode);
  }, [mode]);

  useEffect(() => {
    persistBankProfileId(profileId);
  }, [profileId]);

  useEffect(() => {
    if (!isPastDate) {
      setHistoricalRateLookup({ status: 'idle' });
      return;
    }

    let active = true;
    const date = purchaseDate;
    setHistoricalRateLookup({ status: 'loading', date });
    const pendingRequest =
      historicalRequestRef.current?.date === date
        ? historicalRequestRef.current.promise
        : fetchHistoricalRateForDate(date);
    historicalRequestRef.current = { date, promise: pendingRequest };

    void pendingRequest.then(
      (historicalRates) => {
        if (historicalRequestRef.current?.promise === pendingRequest) {
          historicalRequestRef.current = null;
        }
        if (!active) return;
        setHistoricalRateLookup({
          status: 'loaded',
          date,
          rates: historicalRates,
          draft: createHistoricalRateDraft(historicalRates),
        });
      },
      (error: unknown) => {
        if (historicalRequestRef.current?.promise === pendingRequest) {
          historicalRequestRef.current = null;
        }
        if (!active) return;
        setHistoricalRateLookup({
          status: 'error',
          date,
          message: getErrorMessage(
            error,
            'No fue posible consultar las tasas históricas. Ingresa ambas tasas manualmente.',
          ),
          draft: { bcv: '', binance: '', editedBcv: false, editedBinance: false },
        });
      },
    );

    return () => {
      active = false;
    };
  }, [isPastDate, purchaseDate]);

  const selectedHistoricalLookup: HistoricalRateLookup | null = isPastDate
    ? historicalRateLookup.status !== 'idle' && historicalRateLookup.date === purchaseDate
      ? historicalRateLookup
      : { status: 'loading', date: purchaseDate }
    : null;
  const historicalDraft =
    selectedHistoricalLookup?.status === 'loaded' ||
    selectedHistoricalLookup?.status === 'error'
      ? selectedHistoricalLookup.draft
      : null;
  const effectiveBcvRate = isTodayDate
    ? rates.bcv.value
    : parsePositiveRate(historicalDraft?.bcv ?? '') ?? 0;
  const effectiveBinanceRate = isTodayDate
    ? rates.binance.value
    : parsePositiveRate(historicalDraft?.binance ?? '') ?? 0;
  const liveRatesConfigured =
    Number.isFinite(rates.bcv.value) &&
    rates.bcv.value > 0 &&
    Number.isFinite(rates.binance.value) &&
    rates.binance.value > 0;
  const ratesConfigured = isTodayDate
    ? liveRatesConfigured
    : isPastDate && effectiveBcvRate > 0 && effectiveBinanceRate > 0;
  const rateReference =
    isPastDate && selectedHistoricalLookup
      ? getRateReferenceForDate(purchaseDate, selectedHistoricalLookup)
      : undefined;
  const rateSource = isTodayDate
    ? 'live'
    : rateReference?.source ??
      (selectedHistoricalLookup?.status === 'error' ? 'manual' : isPastDate ? 'historical' : null);
  const rateSourceLabel =
    rateSource === 'live'
      ? 'En vivo'
      : rateSource === 'historical'
        ? 'Histórica'
        : rateSource === 'manual'
          ? 'Manual'
          : '—';

  const exchangeGap = useMemo(
    () =>
      ratesConfigured
        ? getExchangeGap(effectiveBcvRate, effectiveBinanceRate)
        : null,
    [effectiveBcvRate, effectiveBinanceRate, ratesConfigured],
  );

  const calculation = useMemo<CalculationState>(() => {
    const amount = amountValue;
    const amountError =
      !Number.isFinite(amount) || amount <= 0 ? 'Ingresa un monto válido mayor que 0.' : undefined;

    if (!selectedProfile || !ratesConfigured || amountError || dateError) {
      return {
        input: null,
        result: null,
        amountError,
        dateError,
        engineError: null,
        ratesConfigured,
      };
    }

    const input: CalculationInput = {
      mode,
      amount,
      bcvRate: effectiveBcvRate,
      binanceRate: effectiveBinanceRate,
      profile: selectedProfile,
      options,
    };

    try {
      return {
        input,
        result: calculate(input),
        amountError,
        dateError,
        engineError: null,
        ratesConfigured,
      };
    } catch (error) {
      return {
        input,
        result: null,
        amountError,
        dateError,
        engineError: getErrorMessage(error, 'No fue posible calcular la operación.'),
        ratesConfigured,
      };
    }
  }, [
    amountText,
    dateError,
    effectiveBcvRate,
    effectiveBinanceRate,
    mode,
    options,
    ratesConfigured,
    selectedProfile,
  ]);

  const referenceCalculation = useMemo<CalculationResult | null>(() => {
    if (!selectedProfile || !ratesConfigured) return null;

    const input: CalculationInput = {
      mode: 'usd',
      amount: 100,
      bcvRate: effectiveBcvRate,
      binanceRate: effectiveBinanceRate,
      profile: selectedProfile,
      options,
    };

    try {
      return calculate(input);
    } catch {
      return null;
    }
  }, [
    effectiveBcvRate,
    effectiveBinanceRate,
    options,
    ratesConfigured,
    selectedProfile,
  ]);

  const calculationSignature =
    calculation.input && calculation.result
      ? JSON.stringify({
          input: calculation.input,
          purchaseDate,
          rateReference: rateReference ?? null,
        })
      : null;
  const alreadyRegistered =
    calculationSignature !== null && registeredSignature === calculationSignature;
  const canRegister =
    calculation.input !== null &&
    calculation.result !== null &&
    !dateError &&
    !alreadyRegistered;

  useEffect(() => {
    setFeedback(null);
  }, [calculationSignature]);

  const clearFeedback = (): void => {
    setFeedback(null);
    setRegisteredSignature(null);
    registeredSignatureRef.current = null;
  };

  const handlePurchaseDateChange = (nextDate: string): void => {
    if (nextDate === purchaseDate) return;
    setPurchaseDate(nextDate);
    setHistoricalRateLookup(
      nextDate !== '' && nextDate < today
        ? { status: 'loading', date: nextDate }
        : { status: 'idle' },
    );
    clearFeedback();
  };

  const updateHistoricalRate = (field: 'bcv' | 'binance', value: string): void => {
    clearFeedback();
    setHistoricalRateLookup((current) => {
      if (
        (current.status !== 'loaded' && current.status !== 'error') ||
        current.date !== purchaseDate
      ) {
        return current;
      }

      const editedField = field === 'bcv' ? 'editedBcv' : 'editedBinance';
      return {
        ...current,
        draft: {
          ...current.draft,
          [field]: value,
          [editedField]: true,
        },
      };
    });
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
      const metadata: PurchaseRecordMetadata = {
        purchaseDate,
        ...(rateReference ? { rateReference } : {}),
      };
      recordPurchase(input, notes.trim(), metadata);
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
  const loadedHistoricalLookup =
    selectedHistoricalLookup?.status === 'loaded' ? selectedHistoricalLookup : null;
  const binanceReferenceLabel =
    loadedHistoricalLookup?.rates.binance.method === 'average'
      ? 'promedio diario'
      : 'mediana diaria';
  const historicalRateMessage = loadedHistoricalLookup
    ? [
        `Fuente aplicada: ${rateSourceLabel}.`,
        loadedHistoricalLookup.draft.editedBcv
          ? 'BCV ajustado manualmente.'
          : loadedHistoricalLookup.rates.bcv.forwardFilled
            ? `BCV: sin publicación para esta fecha; se arrastra la última tasa oficial publicada el ${formatDateOnly(loadedHistoricalLookup.rates.bcv.capturedAt.slice(0, 10))}.`
            : `BCV: tasa oficial publicada el ${formatDateOnly(loadedHistoricalLookup.rates.bcv.capturedAt.slice(0, 10))}.`,
        loadedHistoricalLookup.draft.editedBinance
          ? 'Binance P2P ajustado manualmente.'
          : 'Binance P2P: ' + binanceReferenceLabel + ' de muestras; es una referencia, no una cotización exacta ejecutada.',
      ].join(' ')
    : null;
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
            : dateError
              ? 'Sin fecha'
            : !selectedProfile
              ? 'Sin perfil'
              : !calculation.ratesConfigured
                ? 'Sin tasas'
                : 'Sin cálculo';
  const waterfallHint = dateError
    ? 'Selecciona una fecha de compra válida para generar el desglose.'
    : !selectedProfile
    ? 'Crea un perfil bancario para generar el desglose.'
    : !calculation.ratesConfigured
      ? isPastDate
        ? 'Espera la consulta histórica o ingresa ambas tasas manualmente para ver el desglose.'
        : 'Configura las tasas BCV y Binance P2P para ver el desglose.'
      : 'No fue posible generar el desglose con la configuración actual.';

  return (
    <section className={styles.panel} aria-label="Calculadora de arbitraje">
      {staleP2pWarning && (
        <aside className={styles.staleRateNotice} role="alert">
          <p className={styles.staleRateNoticeTitle}>{staleP2pWarning.title}</p>
          <p>{staleP2pWarning.message}</p>
        </aside>
      )}

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
                        Math.max(
                          selectedProfile.binanceDepositFixedUsd,
                          DEFAULT_P2P_FIXED_FEE_USDT,
                        ),
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
                value={amountText.trim() === '' ? '0' : amountText}
                onChange={(value) => {
                  clearFeedback();
                  setAmountText(value);
                  setAmountTouched(true);
                }}
                suffix={mode === 'bs' ? 'Bs.S' : 'USD'}
                step="any"
                error={amountTouched ? calculation.amountError : undefined}
                hint={amountHint}
              />

              <div className={styles.dateField}>
                <TextField
                  label="Fecha de compra"
                  name="calculator-purchase-date"
                  type="date"
                  value={purchaseDate}
                  max={today}
                  onChange={handlePurchaseDateChange}
                  error={dateError}
                  hint="Hoy se usan las tasas actuales; las fechas anteriores consultan el historial."
                />
              </div>
            </div>

            {isPastDate && (
              <div
                className={styles.historicalRateFields}
                aria-label={`Tasas para la compra del ${formatDateOnly(purchaseDate)}`}
                aria-busy={selectedHistoricalLookup?.status === 'loading'}
              >
                {selectedHistoricalLookup?.status === 'loading' && (
                  <p className={styles.historicalRateMessage} role="status">
                    Consultando tasas históricas para {formatDateOnly(purchaseDate)}…
                  </p>
                )}
                {selectedHistoricalLookup?.status === 'error' && (
                  <p
                    className={`${styles.historicalRateMessage} ${styles.historicalRateError}`}
                    role="alert"
                  >
                    {selectedHistoricalLookup.message} No se usarán las tasas actuales; ingresa ambas tasas manualmente.
                  </p>
                )}
                {historicalRateMessage && (
                  <p className={styles.historicalRateMessage} role="note">
                    {historicalRateMessage}
                  </p>
                )}
                {historicalDraft && (
                  <div className={styles.historicalRateInputs}>
                    <NumberField
                      label="Tasa BCV para esta compra"
                      name="calculator-bcv-rate"
                      value={historicalDraft.bcv}
                      onChange={(value) => updateHistoricalRate('bcv', value)}
                      suffix="Bs.S/USD"
                      step={0.01}
                      decimals={4}
                      hint={
                        historicalDraft.editedBcv
                          ? 'Valor manual y local a esta compra.'
                          : 'Tasa oficial publicada; puedes ajustarla manualmente.'
                      }
                    />
                    <NumberField
                      label="Referencia diaria Binance P2P"
                      name="calculator-binance-rate"
                      value={historicalDraft.binance}
                      onChange={(value) => updateHistoricalRate('binance', value)}
                      suffix="Bs.S/USD"
                      step={0.01}
                      decimals={4}
                      hint={
                        historicalDraft.editedBinance
                          ? 'Valor manual y local a esta compra.'
                          : 'Referencia diaria; no representa una cotización exacta ejecutada.'
                      }
                    />
                  </div>
                )}
              </div>
            )}

            <HeroSummary
              className={styles.mobileHeroSummary}
              result={result}
              profitabilityTone={profitabilityTone}
              profitabilityLabel={profitabilityLabel}
              testId="mobile-hero-summary"
            />

            <dl
              className={styles.rateSummary}
              aria-label={isTodayDate ? 'Tasas actuales' : 'Tasas aplicadas para la fecha de compra'}
            >
              <div className={styles.rateItem}>
                <dt>Tasa BCV</dt>
                <dd>{displayRate(effectiveBcvRate)}</dd>
              </div>
              <div className={styles.rateItem}>
                <dt>Binance P2P</dt>
                <dd>{displayRate(effectiveBinanceRate)}</dd>
              </div>
              {exchangeGap && (
                <div className={`${styles.rateItem} ${styles.rateItemFull}`}>
                  <dt>{isTodayDate ? 'Brecha actual' : 'Brecha para esta fecha'} (vs BCV + 0,50%)</dt>
                  <dd>
                    {formatPct(exchangeGap.pct, 2)}
                    <span className={styles.rateDetail}>
                      ({formatRate(exchangeGap.absoluteBs)} Bs.S)
                    </span>
                  </dd>
                </div>
              )}
            </dl>

            {autoRateRefresh.message && !staleP2pWarning && (
              <p
                className={`${styles.autoRateStatus} ${
                  autoRateRefresh.status === 'error' ? styles.autoRateStatusError : ''
                }`}
                role={autoRateRefresh.status === 'error' ? 'alert' : 'status'}
              >
                {autoRateRefresh.message}
              </p>
            )}

            {isTodayDate && !calculation.ratesConfigured && (
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
                onClick={() => setConfirmRegisterOpen(true)}
                disabled={!canRegister}
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
            {isTodayDate && !calculation.ratesConfigured && (
              <p className={styles.receiptHint} role="note">
                Configura ambas tasas para calcular resultados y tasa mínima.
              </p>
            )}

            <HeroSummary
              className={styles.receiptHeroSummary}
              result={result}
              profitabilityTone={profitabilityTone}
              profitabilityLabel={profitabilityLabel}
              testId="receipt-hero-summary"
            />

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
                {formatBs(Math.abs(result.netProfitBs))} con estas tasas y comisiones. Verifica la
                tasa mínima antes de operar.
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

      {confirmRegisterOpen && calculation.input && result && (
        <Modal
          open
          title="Confirmar Registro de Compra"
          onClose={() => setConfirmRegisterOpen(false)}
        >
          <div className={styles.confirmContent}>
            <p className={styles.confirmHint}>
              Revisa los datos antes de guardar la compra en Registros.
            </p>
            <dl className={styles.confirmSummary}>
              <div>
                <dt>Perfil bancario</dt>
                <dd>{selectedProfile?.name ?? '-'}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{formatDateOnly(purchaseDate)}</dd>
              </div>
              <div>
                <dt>Inversión</dt>
                <dd>{formatBs(result.totalCostBs)}</dd>
              </div>
              <div>
                <dt>USD comprados</dt>
                <dd>{formatUsd(result.usdBought)}</dd>
              </div>
              <div>
                <dt>Retorno Esperado</dt>
                <dd>{formatBs(result.bsOut)}</dd>
              </div>
              <div>
                <dt>Ganancia</dt>
                <dd className={result.netProfitBs < 0 ? styles.negativeValue : styles.positiveValue}>
                  {formatBs(result.netProfitBs)} · ROI {formatPct(result.roiPct, 2)}
                </dd>
              </div>
            </dl>
            {notes.trim() && (
              <p className={styles.confirmHint}>
                <strong>Notas:</strong> {notes.trim()}
              </p>
            )}
            <div className={styles.confirmActions}>
              <Button variant="secondary" onClick={() => setConfirmRegisterOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setConfirmRegisterOpen(false);
                  handleRegister();
                }}
              >
                Confirmar compra
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}





