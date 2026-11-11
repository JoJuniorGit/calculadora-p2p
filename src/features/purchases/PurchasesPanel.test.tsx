/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRecord } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { PurchasesPanel } from './PurchasesPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

function createPurchase(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: 'purchase-1',
    createdAt: '2024-01-02T12:00:00.000Z',
    profileId: 'profile-1',
    profileName: 'Banco Test',
    mode: 'bs',
    inputAmount: 10_000,
    amountBs: 10_000,
    bcvRate: 40,
    binanceRate: 46,
    snapshot: {} as PurchaseRecord['snapshot'],
    usdBought: 250,
    usdForBinance: 250,
    usdDeposited: 250,
    totalCostBs: 10_000,
    estimatedBsOut: 11_730,
    estimatedProfitBs: 1_730,
    estimatedRoiPct: 17.3,
    breakEvenRate: 40,
    requestedInvestmentVes: 10_000,
    requestedUsd: 250,
    accreditationType: 'TOTAL',
    accreditedUsd: 250,
    accreditationRatePercent: 100,
    executedInvestmentVes: 10_000,
    refundedVes: 0,
    accreditationConfirmedAt: null,
    status: 'pending',
    statusHistory: [],
    execution: null,
    notes: '',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    purchases: [createPurchase()],
    profiles: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<PurchasesPanel />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

function getDesktopCells(): string[] {
  const row = container.querySelector('tbody tr');
  return [...(row?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent ?? '');
}

function getHeaders(): string[] {
  return [...container.querySelectorAll('thead th')].map((cell) => cell.textContent ?? '');
}

describe('PurchasesPanel financial table', () => {
  it('moves currencies into the headers and renders numeric-only cells', () => {
    expect(getHeaders()).toEqual([
      'Fecha',
      'Banco',
      'Invertido (Bs.S)',
      'USD depositados',
      'Bs.S de salida',
      'Utilidad (Bs.S)',
      'ROI',
      'Estado',
      'Acciones',
    ]);

    const cells = getDesktopCells();
    expect(cells[2]).toBe('10.000,00');
    expect(cells[3]).toBe('250,00');
    expect(cells[4]).toBe('11.730,00');
    expect(cells[5]).toBe('1.730,00');
    expect(cells[6]).toBe('17,30%');

    const rowText = container.querySelector('tbody tr')?.textContent ?? '';
    expect(rowText).not.toContain('Bs.S');
    expect(rowText).not.toContain('USD');
    expect(container.querySelector('caption')).toBeNull();
  });

  it('offers a quick advance button before the kebab menu', () => {
    const actionsCell = container.querySelector('tbody tr td:last-child');
    const buttons = [...(actionsCell?.querySelectorAll('button') ?? [])];

    expect(buttons.map((button) => button.title)).toEqual(['Avanzar estado', 'Acciones']);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Avanzar estado para Banco Test, 2 ene. 2024');
  });

  it('opens the accreditation modal from the quick action of a pending purchase', () => {
    const quickAction = container.querySelector<HTMLButtonElement>(
      'tbody tr td:last-child button[title="Avanzar estado"]',
    );

    act(() => {
      quickAction?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Acreditación bancaria');
    expect(container.textContent).toContain('Acreditación total (100%)');
    expect(container.textContent).toContain('USD solicitados');
  });

  it('shows a partial accreditation badge with the requested and released amounts', () => {
    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'usd_credited',
            accreditationType: 'PARTIAL',
            accreditationRatePercent: 42.78,
            accreditedUsd: 106.95,
            executedInvestmentVes: 4_300,
            refundedVes: 5_700,
            accreditationConfirmedAt: '2024-01-03T12:00:00.000Z',
          }),
        ],
      });
    });

    const badge = container.querySelector<HTMLElement>(
      'tbody tr td:nth-child(4) span[title*="Solicitado"]',
    );

    expect(badge?.textContent).toContain('Parcial (42,78%)');
    expect(badge?.getAttribute('title')).toContain('Solicitado:');
    expect(badge?.getAttribute('title')).toContain('Aprobado:');
    expect(badge?.getAttribute('title')).toContain('Liberado:');
  });

  it('labels the quick action for liquidation when completion is next', () => {
    act(() => {
      useAppStore.setState({
        purchases: [createPurchase({ status: 'deposited_binance' })],
      });
    });

    const quickAction = container.querySelector<HTMLButtonElement>(
      'tbody tr td:last-child button[title="Liquidar operación"]',
    );
    expect(quickAction).not.toBeNull();
    expect(quickAction?.getAttribute('aria-label')).toContain('Liquidar operación');
  });
});
