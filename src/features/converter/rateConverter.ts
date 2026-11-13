import type {
  MultiRateConversionResult,
  MultiRateSource,
  RateKey,
  Rates,
} from '../../domain/types';
import { round2 } from '../../domain/calculations';
import { formatAmount, formatPct } from '../../utils/format';

export type ConverterRateOption = 'BCV' | 'BINANCE';
export type ConverterSlot = 'SLOT_1' | 'SLOT_2';

export interface ConverterRateDescriptor {
  value: ConverterRateOption;
  label: string;
  cardTitle: string;
  unit: 'USD' | 'USDT';
  rateKey: RateKey;
}

export const CONVERTER_RATE_OPTIONS: ConverterRateDescriptor[] = [
  { value: 'BCV', label: 'BCV', cardTitle: 'Dólar BCV', unit: 'USD', rateKey: 'bcv' },
  {
    value: 'BINANCE',
    label: 'Binance P2P',
    cardTitle: 'Binance P2P',
    unit: 'USDT',
    rateKey: 'binance',
  },
];

export const DEFAULT_CONVERTER_SLOT_RATES: Record<ConverterSlot, ConverterRateOption> = {
  SLOT_1: 'BCV',
  SLOT_2: 'BINANCE',
};

export function getRateDescriptor(
  option: ConverterRateOption,
): ConverterRateDescriptor {
  return (
    CONVERTER_RATE_OPTIONS.find((descriptor) => descriptor.value === option) ??
    CONVERTER_RATE_OPTIONS[0]
  );
}

export function getOptionRateValue(
  option: ConverterRateOption,
  rates: Rates,
): number {
  return rates[getRateDescriptor(option).rateKey].value;
}

/**
 * Keeps both slots on different rates: picking the rate already used by the
 * other slot swaps them instead of duplicating it.
 */
export function swapConverterSlotRate(
  slot: ConverterSlot,
  option: ConverterRateOption,
  current: Record<ConverterSlot, ConverterRateOption>,
): Record<ConverterSlot, ConverterRateOption> {
  if (slot === 'SLOT_1') {
    if (option === current.SLOT_2) {
      return { SLOT_1: option, SLOT_2: current.SLOT_1 };
    }
    return { ...current, SLOT_1: option };
  }

  if (option === current.SLOT_1) {
    return { SLOT_1: current.SLOT_2, SLOT_2: option };
  }
  return { ...current, SLOT_2: option };
}

/** Swaps both slot rates, keeping the pair unique. */
export function swapConverterSlots(
  current: Record<ConverterSlot, ConverterRateOption>,
): Record<ConverterSlot, ConverterRateOption> {
  return { SLOT_1: current.SLOT_2, SLOT_2: current.SLOT_1 };
}

export interface EquivalenceMetrics {
  /** USD/USDT amount the metrics are based on. */
  usdBase: number;
  savingsUsd: number;
  savingsPct: number;
  purchasingPowerUsd: number;
  /** Net difference in Bs.S for the consulted USD amount. */
  deltaBs: number;
}

export function buildEquivalenceMetrics(
  source: MultiRateSource,
  result: MultiRateConversionResult,
  rate1: number,
  rate2: number,
): EquivalenceMetrics | null {
  const usdBase = source === 'SLOT_2' ? result.slot2Usd : result.slot1Usd;
  if (!Number.isFinite(usdBase) || usdBase <= 0) return null;

  const maxUsd = Math.max(result.slot1Usd, result.slot2Usd);

  return {
    usdBase,
    savingsUsd: result.usdDifference,
    savingsPct: maxUsd > 0 ? (result.usdDifference / maxUsd) * 100 : 0,
    purchasingPowerUsd: result.usdDifference,
    deltaBs: round2(usdBase * Math.abs(rate1 - rate2)),
  };
}

/** Parses "50,5", "1.234,56", "100." and plain decimals; null when empty/invalid. */
export function parseAmountInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Plain number without grouping, suitable for the clipboard. */
export function formatClipboardValue(value: number): string {
  return String(value);
}

export function buildEquivalenceMessage(
  source: MultiRateSource,
  result: MultiRateConversionResult,
  label1: string,
  label2: string,
): string {
  const difference = `Diferencia: ${formatAmount(result.usdDifference)} USD`;
  const spread = `Brecha entre tasas: ${formatPct(result.spreadPercentBetweenSlots)}`;

  if (source === 'VES') {
    return `Con ${formatAmount(result.vesAmount)} Bs.S a tasa ${label1} obtienes ${formatAmount(
      result.slot1Usd,
    )} USD; a tasa ${label2}, ${formatAmount(result.slot2Usd)} USD. ${difference} · ${spread}.`;
  }

  if (source === 'SLOT_1') {
    return `Para cubrir ${formatAmount(result.slot1Usd)} USD a tasa ${label1} necesitas ${formatAmount(
      result.vesAmount,
    )} Bs.S, que a tasa ${label2} equivalen a ${formatAmount(
      result.slot2Usd,
    )} USD. ${difference} · ${spread}.`;
  }

  return `Para cubrir ${formatAmount(result.slot2Usd)} USD a tasa ${label2} necesitas ${formatAmount(
    result.vesAmount,
  )} Bs.S, que a tasa ${label1} equivalen a ${formatAmount(
    result.slot1Usd,
  )} USD. ${difference} · ${spread}.`;
}
