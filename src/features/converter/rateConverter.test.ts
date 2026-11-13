import { describe, expect, it } from 'vitest';
import { calculateMultiRateConversion } from '../../domain/calculations';
import {
  buildEquivalenceMetrics,
  parseAmountInput,
  swapConverterSlotRate,
  swapConverterSlots,
  type ConverterRateOption,
  type ConverterSlot,
} from './rateConverter';

const DEFAULT_SLOTS: Record<ConverterSlot, ConverterRateOption> = {
  SLOT_1: 'BCV',
  SLOT_2: 'BINANCE',
};

describe('swapConverterSlotRate', () => {
  it('swaps both slots when Slot 1 picks the rate already used by Slot 2', () => {
    expect(swapConverterSlotRate('SLOT_1', 'BINANCE', DEFAULT_SLOTS)).toEqual({
      SLOT_1: 'BINANCE',
      SLOT_2: 'BCV',
    });
  });

  it('swaps both slots when Slot 2 picks the rate already used by Slot 1', () => {
    expect(swapConverterSlotRate('SLOT_2', 'BCV', DEFAULT_SLOTS)).toEqual({
      SLOT_1: 'BINANCE',
      SLOT_2: 'BCV',
    });
  });

  it('keeps both slots unique when selecting the other rate', () => {
    const next = swapConverterSlotRate('SLOT_1', 'BINANCE', DEFAULT_SLOTS);

    expect(next).toEqual({ SLOT_1: 'BINANCE', SLOT_2: 'BCV' });
    expect(next.SLOT_1).not.toBe(next.SLOT_2);
  });
});

describe('parseAmountInput', () => {
  it('accepts es-VE and plain decimal formats', () => {
    expect(parseAmountInput('50,5')).toBe(50.5);
    expect(parseAmountInput('1.234,56')).toBe(1234.56);
    expect(parseAmountInput('100.')).toBe(100);
    expect(parseAmountInput('250')).toBe(250);
  });

  it('returns null for empty, negative or invalid input', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('   ')).toBeNull();
    expect(parseAmountInput('-5')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
  });
});

describe('swapConverterSlots', () => {
  it('inverts both slot rates', () => {
    expect(swapConverterSlots({ SLOT_1: 'BCV', SLOT_2: 'BINANCE' })).toEqual({
      SLOT_1: 'BINANCE',
      SLOT_2: 'BCV',
    });
  });
});

describe('buildEquivalenceMetrics', () => {
  it('derives savings, purchasing power and the Bs.S delta from the conversion', () => {
    const result = calculateMultiRateConversion('VES', 11_730, 40, 46);
    const metrics = buildEquivalenceMetrics('VES', result, 40, 46);

    expect(metrics).not.toBeNull();
    expect(metrics?.usdBase).toBe(293.25);
    expect(metrics?.savingsUsd).toBe(38.25);
    expect(metrics?.savingsPct).toBeCloseTo((38.25 / 293.25) * 100);
    expect(metrics?.purchasingPowerUsd).toBe(38.25);
    expect(metrics?.deltaBs).toBe(1_759.5);
  });

  it('uses the Slot 2 amount as the base when it is the active source', () => {
    const result = calculateMultiRateConversion('SLOT_2', 100, 40, 46);
    const metrics = buildEquivalenceMetrics('SLOT_2', result, 40, 46);

    expect(metrics?.usdBase).toBe(100);
    expect(metrics?.deltaBs).toBe(600);
  });

  it('returns null when there is nothing to compare', () => {
    const zero = calculateMultiRateConversion('VES', 0, 40, 46);
    expect(buildEquivalenceMetrics('VES', zero, 40, 46)).toBeNull();
  });
});
