import { describe, expect, it } from 'vitest';
import { distributeTableWidths, resolveTableColumnWidths } from './tableColumns';

describe('distributeTableWidths', () => {
  const base = resolveTableColumnWidths({});

  it('keeps the configured widths when the container is narrower than the table', () => {
    const result = distributeTableWidths(base, 700);

    expect(result.fillable).toBe(false);
    expect(result.widths).toEqual(base);
    expect(result.totalWidth).toBe(924);
  });

  it('shares the spare room between the resizable columns and keeps Acciones fixed', () => {
    const result = distributeTableWidths(base, 1224);

    expect(result.fillable).toBe(true);
    expect(result.totalWidth).toBe(1224);
    expect(result.widths.actions).toBe(64);
    expect(result.widths.bank).toBeCloseTo(290);

    const total = Object.values(result.widths).reduce((sum, width) => sum + width, 0);
    expect(total).toBeCloseTo(1224);
  });

  it('only fills when the container is wider than the configured total', () => {
    expect(distributeTableWidths(base, 924).fillable).toBe(false);
    expect(distributeTableWidths(base, 925).fillable).toBe(true);
  });
});
