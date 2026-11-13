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

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
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
      'Resultado',
      'Ganancia',
      'Estado',
      'Acciones',
    ]);

    const cells = getDesktopCells();
    expect(cells[1]).toContain('10.000,00 Bs.S');
    expect(cells[1]).toContain('250,00 USD');
    expect(cells[1].indexOf('Bs.S')).toBeLessThan(cells[1].indexOf('USD'));
    expect(cells[2]).toBe('');
    expect(cells[3]).toBe('');
    expect(cells[4]).toContain('En espera');
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

  it('hides utility until completion and shows it after the sale', () => {
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
    expect(cells[2]).toContain('11.730,00 Bs.S');
    expect(cells[2]).toContain('255,00 USD');
    expect(cells[2].indexOf('Bs.S')).toBeLessThan(cells[2].indexOf('USD'));
    expect(cells[3]).toBe('');
    expect(cells[4]).toContain('Parcial');

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
    expect(cells[2]).toContain('11.730,00 Bs.S');
    expect(cells[2]).toContain('255,00 USD');
    expect(cells[2].indexOf('Bs.S')).toBeLessThan(cells[2].indexOf('USD'));
    expect(cells[3]).toContain('37,61 USD');
    expect(cells[3]).toContain('17,30%');
    expect(cells[3]).not.toContain('Bs.S');
    expect(cells[4]).toContain('Completo');
  });

  it('shows the remaining USDT in the status column for Binance and partial purchases', () => {
    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'deposited_binance',
            initialBinanceUsdt: 250,
            remainingBinanceUsdt: 250,
            remainingCostVes: 10_000,
          }),
        ],
      });
    });

    let statusCell = container.querySelector('tbody tr td:nth-child(5)');
    expect(statusCell?.textContent).toContain('En Binance');
    expect(statusCell?.textContent).toContain('250,00 USDT');

    const depositedNote = statusCell?.querySelector(
      'span[title^="Costo restante"]',
    );
    expect(depositedNote?.getAttribute('aria-label')).toContain(
      'Costo restante: 10.000,00 Bs.S',
    );

    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'partial',
            initialBinanceUsdt: 250,
            remainingBinanceUsdt: 120,
            remainingCostVes: 4_800,
          }),
        ],
      });
    });

    statusCell = container.querySelector('tbody tr td:nth-child(5)');
    expect(statusCell?.textContent).toContain('Parcial');
    expect(statusCell?.textContent).toContain('120,00 USDT');

    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'completed',
            initialBinanceUsdt: 250,
            remainingBinanceUsdt: 0,
            remainingCostVes: 0,
          }),
        ],
      });
    });

    statusCell = container.querySelector('tbody tr td:nth-child(5)');
    expect(statusCell?.textContent).toContain('Completo');
    expect(
      statusCell?.querySelector('span[title^="Costo restante"]'),
    ).toBeNull();
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

describe('PurchasesPanel sales registration and data import', () => {
  it('offers registering a sale from the purchases section', () => {
    act(() => {
      useAppStore.setState({
        purchases: [createPurchase({ status: 'deposited_binance' })],
      });
    });

    clickButton('Registrar venta P2P');

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('USDT a vender');
    expect(container.textContent).toContain('Confirmar venta');
  });

  it('registers a sale from the purchases section and reveals it in the sales view', () => {
    act(() => {
      useAppStore.setState({
        purchases: [createPurchase({ status: 'deposited_binance' })],
      });
    });

    clickButton('Registrar venta P2P');

    const [usdtInput, rateInput] = [
      ...container.querySelectorAll<HTMLInputElement>('input[role="spinbutton"]'),
    ];
    // NumberField stores digits with implied decimals: 10000 -> 100.00 USDT.
    setInputValue(usdtInput, '10000');
    setInputValue(rateInput, '10000000');
    clickButton('Confirmar venta');

    expect(useAppStore.getState().sales).toHaveLength(1);
    expect(getPurchaseRows()).toBe(0);
    expect(getSaleRows()).toBe(1);
    expect(
      container.querySelector('table[aria-label="Ventas P2P registradas"]'),
    ).not.toBeNull();
  });

  it('imports the sales included in a records file together with their purchases', async () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2024-01-02T12:00:00.000Z',
      purchases: [
        createPurchase({
          id: 'imported-purchase',
          status: 'deposited_binance',
          snapshot: {
            profileId: 'profile-1',
            profileName: 'Banco Test',
            mode: 'bs',
            inputAmount: 10_000,
            amountBs: 10_000,
            bcvRate: 40,
            binanceRate: 46,
            interventionPct: 0,
            interventionFeeBs: 0,
            netForPurchaseBs: 10_000,
            cardCommissionPct: 2,
            cardCommissionBase: 'usd',
            cardCommissionUsd: 0,
            cardCommissionBs: 0,
            binanceDepositPct: 1,
            binanceDepositFixedUsd: 0.5,
            binanceDepositUsd: 0,
            interbankEnabled: false,
            interbankPct: 0.3,
            interbankBase: 'initial',
            interbankCostBs: 0,
            igtfEnabled: false,
            igtfPct: 3,
            igtfBase: 'card',
            igtfCostBs: 0,
            slippageEnabled: false,
            slippagePct: 2,
          },
        }),
      ],
      sales: [createSale('imported-sale')],
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    if (!input) return;
    const file = new File([payload], 'registros.json', { type: 'application/json' });
    // jsdom ships File without Blob.text(); the browser provides it natively.
    Object.defineProperty(file, 'text', { value: async () => payload, configurable: true });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useAppStore.getState().sales.map((sale) => sale.id)).toEqual(['imported-sale']);
    expect(useAppStore.getState().purchases.map((purchase) => purchase.id)).toEqual([
      'purchase-1',
      'imported-purchase',
    ]);
    expect(useAppStore.getState().purchases[1].status).toBe('partial');
    expect(container.textContent).toContain('Se importaron 1 compras y 1 ventas.');
  });
});
