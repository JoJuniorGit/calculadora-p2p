import { describe, expect, it } from 'vitest';
import { atmInputToValue, formatAtmDisplay, nextAtmValue } from './atmInput';

describe('formatAtmDisplay', () => {
  it('formats with es-VE grouping and fixed decimals', () => {
    expect(formatAtmDisplay('11730.00')).toBe('11.730,00');
    expect(formatAtmDisplay('0.01')).toBe('0,01');
    expect(formatAtmDisplay('1234.5')).toBe('1.234,50');
  });

  it('supports four decimals and keeps invalid input untouched', () => {
    expect(formatAtmDisplay('901.6175', 4)).toBe('901,6175');
    expect(formatAtmDisplay('abc')).toBe('abc');
    expect(formatAtmDisplay('')).toBe('');
  });
});

describe('atmInputToValue', () => {
  it('shifts digits from right to left with implied decimals', () => {
    expect(atmInputToValue('1')).toBe('0.01');
    expect(atmInputToValue('1173000')).toBe('11730.00');
    expect(atmInputToValue('901,6175', 4)).toBe('901.6175');
  });

  it('returns an empty string when there are no digits', () => {
    expect(atmInputToValue('')).toBe('');
    expect(atmInputToValue(',')).toBe('');
  });
});

describe('nextAtmValue', () => {
  it('applies the ATM edit over the previous display', () => {
    expect(nextAtmValue('', '1')).toBe('0.01');
    expect(nextAtmValue('0,01', '0,010')).toBe('0.10');
  });

  it('clears the value when deleting only zeros', () => {
    expect(nextAtmValue('0,01', '0,0')).toBe('');
    expect(nextAtmValue('1,00', '')).toBe('');
  });
});
