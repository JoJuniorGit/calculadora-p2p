/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRecord, SaleRecord } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { formatDate, formatDateOnly } from '../../utils/format';
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
    sales: [],
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

function createSale(id: string): SaleRecord {
  return {
    id,
    createdAt: '2024-01-02T12:00:00.000Z',
    notes: '',
    totalUsdtSold: 100,
    p2pFixedFeeUsdt: 0.06,
    netUsdtLiquidated: 99.94,
    sellRateVes: 1_000,
    totalVesReceived: 99_940,
    totalAllocatedCostVes: 90_000,
    totalRealizedProfitVes: 9_940,
    realizedRoiPercent: 11.04,
    walletBalanceAfterUsdt: 100,
    allocations: [],
  };
}

function getHeaders(): string[] {
  return [...container.querySelectorAll('thead th')].map((cell) => cell.textContent ?? '');
}

function clickButton(text: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function clickButtonStartingWith(text: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim().startsWith(text),
  );
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function getPurchaseRows(): number {
  return container.querySelectorAll(
    'table[aria-label="Compras registradas"] tbody tr',
  ).length;
}

function getSaleRows(): number {
  return container.querySelectorAll(
    'table[aria-label="Ventas P2P registradas"] tbody tr',
  ).length;
}

describe('PurchasesPanel financial table', () => {
  it('shows USD/USDT as the primary amount and Bs.S as secondary', () => {
    expect(getHeaders()).toEqual([
      'Banco',
      'Inversión',
      'En Binance',
      'Resultado',
      'Utilidad',
      'Estado',
      'Acciones',
    ]);

    const cells = getDesktopCells();
    expect(cells[1]).toContain('10.000,00 Bs.S');
    expect(cells[1]).toContain('250,00 USD');
    expect(cells[1].indexOf('Bs.S')).toBeLessThan(cells[1].indexOf('USD'));
    expect(cells[2]).toBe('-');
    expect(cells[3]).toBe('');
    expect(cells[4]).toBe('');
    expect(container.querySelector('caption')).toBeNull();
  });

  it('shows purchaseDate in both purchase views and keeps createdAt for legacy records', () => {
    expect(formatDateOnly('2024-01-02')).toBe(
      new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(
        new Date(2024, 0, 2, 12),
      ),
    );
    const datedPurchase = createPurchase({
      id: 'historical-purchase',
      createdAt: '2024-01-10T12:00:00.000Z',
      purchaseDate: '2024-01-02',
      rateReference: {
        source: 'historical',
        bcvAsOf: '2024-01-02T00:00:00.000Z',
        bcvForwardFilled: false,
        binanceAsOf: '2024-01-02T12:00:00.000Z',
        binanceMethod: 'median',
      },
    });
    const legacyPurchase = createPurchase({
      id: 'legacy-purchase',
      createdAt: '2024-01-03T12:00:00.000Z',
    });
    act(() => {
      useAppStore.setState({ purchases: [datedPurchase, legacyPurchase] });
    });

    const desktopRows = [
      ...container.querySelectorAll('table[aria-label="Compras registradas"] tbody tr'),
    ];
    const mobileCards = [
      ...container.querySelectorAll('div[aria-label="Registros de compras"] article'),
    ];
    const desktopDates = desktopRows.map(
      (row) => row.querySelector('td:first-child time')?.textContent,
    );
    const mobileDates = mobileCards.map(
      (card) => card.querySelector('time')?.textContent,
    );

    expect(desktopDates).toEqual([
      formatDateOnly('2024-01-02'),
      formatDate(legacyPurchase.createdAt),
    ]);
    expect(mobileDates).toEqual(desktopDates);
    expect(desktopRows[0]?.textContent).toContain('Histórica');
    expect(desktopRows[1]?.textContent).toContain('Legada');
    expect(mobileCards[0]?.textContent).toContain('Histórica');
    expect(mobileCards[1]?.textContent).toContain('Legada');
  });

  it('shows the result after a sale and hides utility until completion', () => {
    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'partial',
            realizedRevenueVes: 11_730,
            realizedProfitVes: 1_730,
            allocatedCostVesTotal: 10_000,
            weightedAverageSellRateVes: 46,
          }),
        ],
      });
    });

    let cells = getDesktopCells();
    expect(cells[3]).toContain('11.730,00 Bs.S');
    expect(cells[3]).toContain('255,00 USD');
    expect(cells[3].indexOf('Bs.S')).toBeLessThan(cells[3].indexOf('USD'));
    expect(cells[4]).toBe('');

    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'completed',
            realizedRevenueVes: 11_730,
            realizedProfitVes: 1_730,
            allocatedCostVesTotal: 10_000,
            weightedAverageSellRateVes: 46,
          }),
        ],
      });
    });

    cells = getDesktopCells();
    expect(cells[3]).toContain('11.730,00 Bs.S');
    expect(cells[3]).toContain('255,00 USD');
    expect(cells[3].indexOf('Bs.S')).toBeLessThan(cells[3].indexOf('USD'));
    expect(cells[4]).toContain('37,61 USD');
    expect(cells[4]).toContain('17,30%');
    expect(cells[4]).not.toContain('Bs.S');
  });

  it('offers a quick advance button before the kebab menu', () => {
    const actionsCell = container.querySelector('tbody tr td:last-child');
    const buttons = [...(actionsCell?.querySelectorAll('button') ?? [])];

    expect(buttons.map((button) => button.title)).toEqual([
      'Registrar acreditación',
      'Acciones',
    ]);
    expect(buttons[0]?.getAttribute('aria-label')).toBe(
      'Registrar acreditación para Banco Test, 2 ene. 2024',
    );
  });

  it('opens the accreditation modal from the quick action of a pending purchase', () => {
    const quickAction = container.querySelector<HTMLButtonElement>(
      'tbody tr td:last-child button[title="Registrar acreditación"]',
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
      'tbody tr td:nth-child(2) span[title*="Solicitado"]',
    );

    expect(badge?.textContent).toContain('Parcial (42,78%)');
    expect(badge?.getAttribute('title')).toContain('Solicitado:');
    expect(badge?.getAttribute('title')).toContain('Aprobado:');
    expect(badge?.getAttribute('title')).toContain('Liberado:');
  });

  it('does not offer a manual liquidation once the lot is in Binance', () => {
    act(() => {
      useAppStore.setState({
        purchases: [createPurchase({ status: 'deposited_binance' })],
      });
    });

    const actionsCell = container.querySelector('tbody tr td:last-child');
    const buttons = [...(actionsCell?.querySelectorAll('button') ?? [])];

    expect(buttons.map((button) => button.title)).toEqual(['Acciones']);
  });

  it('renders the filters as a compact toolbar with inline labels', () => {
    const toolbar = container.querySelector(
      'div[role="search"][aria-label="Filtros de compras"]',
    );

    expect(toolbar).not.toBeNull();
    expect(toolbar?.textContent).toContain('Filtros:');
    expect(toolbar?.textContent).toContain('Estado');
    expect(toolbar?.textContent).toContain('Banco');
    expect(toolbar?.textContent).toContain('Desde');
    expect(toolbar?.textContent).toContain('Hasta');
    expect(toolbar?.querySelectorAll('select')).toHaveLength(2);
    expect(toolbar?.querySelectorAll('h2')).toHaveLength(0);

    const clearButton = [...(toolbar?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.includes('Limpiar'),
    ) as HTMLButtonElement;
    expect(clearButton.disabled).toBe(true);
  });

  it('separates purchase and sale records into two views', () => {    expect(getPurchaseRows()).toBe(1);
    expect(container.textContent).not.toContain('Aún no hay ventas registradas');

    clickButtonStartingWith('Ventas');

    expect(getPurchaseRows()).toBe(0);
    expect(getSaleRows()).toBe(0);
    expect(container.textContent).toContain('Aún no hay ventas registradas');

    clickButtonStartingWith('Compras');

    expect(getPurchaseRows()).toBe(1);
    expect(getSaleRows()).toBe(0);
  });

  it('paginates the purchase list', () => {
    act(() => {
      useAppStore.setState({
        purchases: Array.from({ length: 12 }, (_, index) =>
          createPurchase({ id: `purchase-${index}` }),
        ),
      });
    });

    expect(getPurchaseRows()).toBe(10);
    expect(container.textContent).toContain('Página 1 de 2');

    clickButton('Siguiente');

    expect(getPurchaseRows()).toBe(2);
    expect(container.textContent).toContain('Página 2 de 2');
  });

  it('paginates the sales list independently', () => {
    act(() => {
      useAppStore.setState({
        purchases: [],
        sales: Array.from({ length: 11 }, (_, index) => createSale(`sale-${index}`)),
      });
    });

    clickButtonStartingWith('Ventas');

    expect(getSaleRows()).toBe(10);
    expect(container.textContent).toContain('Página 1 de 2');

    clickButton('Siguiente');

    expect(getSaleRows()).toBe(1);
    expect(container.textContent).toContain('Página 2 de 2');
  });
});
