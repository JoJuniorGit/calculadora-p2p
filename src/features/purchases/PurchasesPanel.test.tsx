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
    tableColumnWidths: {},
    rates: {
      bcv: { value: 0, updatedAt: null, source: 'manual' },
      binance: { value: 0, updatedAt: null, source: 'manual' },
    },
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

function clickButtonByLabel(label: string): void {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
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
      'Inversión (Bs.S)',
      'Resultado (Bs.S)',
      'Ganancia (Bs.S)',
      'Estado',
      'Acciones',
    ]);

    const cells = getDesktopCells();
    expect(cells[1]).toContain('10.000,00');
    expect(cells[1]).toContain('250,00 USD');
    expect(cells[1].indexOf('10.000,00')).toBeLessThan(cells[1].indexOf('USD'));
    expect(cells[2]).toContain('~ 11.730,00');
    expect(cells[2]).toContain('~ 255,00 USD netos');
    expect(cells[3]).toContain('~ 1.730,00');
    expect(cells[3]).toContain('Est. · 17,30%');
    expect(cells[4]).toContain('En espera');
    expect(container.querySelector('caption')).toBeNull();
  });

  it('shows purchaseDate in both purchase views and keeps createdAt for legacy records', () => {
    expect(formatDateOnly('2024-01-02')).toBe('02/01/2024');
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

  it('shows the realized PnL of the sold fraction until the purchase is completed', () => {
    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'partial',
            soldUsdt: 100,
            initialBinanceUsdt: 250,
            realizedRevenueVes: 11_730,
            realizedProfitVes: 1_730,
            allocatedCostVesTotal: 10_000,
            weightedAverageSellRateVes: 46,
          }),
        ],
      });
    });

    let cells = getDesktopCells();
    expect(cells[2]).toContain('11.730,00');
    expect(cells[2]).toContain('Parcial (40%) · +17,30%');
    expect(cells[3]).toContain('1.730,00');
    expect(cells[3]).toContain('Parcial (40%) · +17,30%');
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
    expect(cells[2]).toContain('11.730,00');
    expect(cells[3]).toContain('1.730,00');
    expect(cells[3]).toContain('✓ Real · +17,30%');
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
      'Registrar acreditación para Banco Test, 02/01/2024',
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

    clickButtonByLabel('Página siguiente');

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

    clickButtonByLabel('Página siguiente');

    expect(getSaleRows()).toBe(1);
    expect(container.textContent).toContain('Página 2 de 2');
  });

  it('navigates to the extremes, adjacent pages and an exact page', () => {
    act(() => {
      useAppStore.setState({
        purchases: Array.from({ length: 45 }, (_, index) =>
          createPurchase({ id: `purchase-${index}` }),
        ),
      });
    });

    expect(container.textContent).toContain('Página 1 de 5');

    clickButtonByLabel('Última página');
    expect(container.textContent).toContain('Página 5 de 5');

    clickButtonByLabel('Página anterior');
    expect(container.textContent).toContain('Página 4 de 5');

    clickButtonByLabel('Primera página');
    expect(container.textContent).toContain('Página 1 de 5');

    clickButtonByLabel('Página 3');
    expect(container.textContent).toContain('Página 3 de 5');

    const jumpInput = container.querySelector<HTMLInputElement>(
      'input[aria-label^="Ir a página exacta"]',
    );
    expect(jumpInput).not.toBeNull();
    if (!jumpInput) return;
    setInputValue(jumpInput, '5');

    const jumpForm = jumpInput.closest('form');
    expect(jumpForm).not.toBeNull();
    act(() => {
      jumpForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Página 5 de 5');
  });
});

describe('PurchasesPanel sales registration and data import', () => {
  it('offers registering a sale from the purchases section', () => {
    act(() => {
      useAppStore.setState({
        purchases: [createPurchase({ status: 'deposited_binance' })],
      });
    });

    clickButton('Registrar Venta');

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

    clickButton('Registrar Venta');

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

describe('PurchasesPanel floating and realized PnL', () => {
  const resultCell = (): Element | null =>
    container.querySelector('tbody tr td:nth-child(3)');
  const profitCell = (): Element | null =>
    container.querySelector('tbody tr td:nth-child(4)');

  it('projects the result and profit at the current Binance rate for intact purchases', () => {
    act(() => {
      useAppStore.setState({
        rates: {
          bcv: { value: 40, updatedAt: null, source: 'manual' },
          binance: { value: 50, updatedAt: null, source: 'manual' },
        },
      });
    });

    expect(resultCell()?.textContent).toContain('~ 12.750,00');
    expect(resultCell()?.textContent).toContain('~ 255,00 USD netos');
    expect(profitCell()?.textContent).toContain('~ 2.750,00');
    expect(profitCell()?.textContent).toContain('Est. · 27,50%');
    expect(resultCell()?.querySelector('[title*="Resultado estimado"]')).not.toBeNull();
    expect(profitCell()?.querySelector('[title*="Ganancia estimada"]')).not.toBeNull();
  });

  it('shows the realized PnL of the sold fraction for partially sold purchases', () => {
    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'partial',
            soldUsdt: 100,
            initialBinanceUsdt: 250,
            remainingBinanceUsdt: 150,
            realizedRevenueVes: 27_600,
            realizedProfitVes: 3_000,
            allocatedCostVesTotal: 24_600,
          }),
        ],
      });
    });

    expect(resultCell()?.textContent).toContain('27.600,00');
    expect(resultCell()?.textContent).toContain('Parcial (40%) · +12,20%');
    expect(profitCell()?.textContent).toContain('3.000,00');
    expect(profitCell()?.textContent).toContain('Parcial (40%) · +12,20%');
  });

  it('shows the final realized PnL with a check mark for sold-out purchases', () => {
    act(() => {
      useAppStore.setState({
        purchases: [
          createPurchase({
            status: 'completed',
            soldUsdt: 250,
            initialBinanceUsdt: 250,
            remainingBinanceUsdt: 0,
            realizedRevenueVes: 46_000,
            realizedProfitVes: 6_000,
            allocatedCostVesTotal: 40_000,
          }),
        ],
      });
    });

    expect(resultCell()?.textContent).toContain('46.000,00');
    expect(profitCell()?.textContent).toContain('6.000,00');
    expect(profitCell()?.textContent).toContain('✓ Real · +15,00%');
    expect(resultCell()?.querySelector('[title*="Resultado real"]')).not.toBeNull();
    expect(profitCell()?.querySelector('[title*="Ganancia realizada"]')).not.toBeNull();
  });

  it('keeps the PnL cells empty for cancelled purchases', () => {
    act(() => {
      useAppStore.setState({
        purchases: [createPurchase({ status: 'cancelled' })],
      });
    });

    expect(resultCell()?.textContent).toBe('');
    expect(resultCell()?.getAttribute('aria-label')).toBe('Resultado no disponible');
    expect(profitCell()?.getAttribute('aria-label')).toBe('Ganancia no disponible');
  });
});

describe('PurchasesPanel column resizing', () => {
  const resizeHandle = (label: string): Element | null =>
    container.querySelector(
      `[role="separator"][aria-label="Ajustar ancho de la columna ${label}"]`,
    );

  it('uses strict column widths and only renders handles for resizable columns', () => {
    expect(resizeHandle('Banco')).not.toBeNull();
    expect(resizeHandle('Inversión')).not.toBeNull();
    expect(resizeHandle('Resultado')).not.toBeNull();
    expect(resizeHandle('Ganancia')).not.toBeNull();
    expect(resizeHandle('Estado')).not.toBeNull();
    expect(resizeHandle('Acciones')).toBeNull();

    const table = container.querySelector<HTMLTableElement>(
      'table[aria-label="Compras registradas"]',
    );
    expect(table?.style.width).toBe('924px');
  });

  it('resizes a column with the keyboard and persists the width', () => {
    const handle = resizeHandle('Inversión');
    expect(handle).not.toBeNull();
    if (!handle) return;
    expect(handle.getAttribute('aria-valuenow')).toBe('155');

    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });

    expect(useAppStore.getState().tableColumnWidths.investment).toBe(163);
    expect(handle.getAttribute('aria-valuenow')).toBe('163');
    const columns = container.querySelectorAll('colgroup col');
    expect((columns[1] as HTMLElement).style.width).toBe('163px');
  });

  it('clamps the width to the allowed range and resets it on double click', () => {
    const handle = resizeHandle('Inversión');
    expect(handle).not.toBeNull();
    if (!handle) return;

    for (let step = 0; step < 10; step += 1) {
      act(() => {
        handle.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
        );
      });
    }

    expect(useAppStore.getState().tableColumnWidths.investment).toBe(140);

    act(() => {
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(useAppStore.getState().tableColumnWidths.investment).toBe(155);
  });
});

describe('PurchasesPanel expandable detail', () => {
  it('expands and collapses the inline movement detail', () => {
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Ver detalle de Banco Test"]',
    );
    expect(toggle).not.toBeNull();
    if (!toggle) return;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Resumen');
    expect(container.textContent).toContain('Rendimiento');
    expect(container.textContent).toContain('Historial de estados');
    expect(container.textContent).not.toContain('Abrir detalle completo');

    const expandedToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Ocultar detalle de Banco Test"]',
    );
    expect(expandedToggle?.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      expandedToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Abrir detalle completo');
  });
});

describe('PurchasesPanel mobile cards', () => {
  it('opens the purchase detail by tapping the card body', () => {
    const mobileList = container.querySelector('div[aria-label="Registros de compras"]');
    const card = mobileList?.querySelector('article');
    expect(card).not.toBeNull();
    if (!card) return;

    act(() => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Detalle de compra');
  });

  it('does not open the detail when using the mobile actions menu trigger', () => {
    const mobileTrigger = container.querySelector<HTMLButtonElement>(
      'div[aria-label="Registros de compras"] button[aria-label^="Acciones para"]',
    );
    expect(mobileTrigger).not.toBeNull();
    if (!mobileTrigger) return;

    act(() => {
      mobileTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Detalle de compra');
  });

  it('shows the compact 2x2 data grid without the old detail button', () => {
    const mobileList = container.querySelector('div[aria-label="Registros de compras"]');
    const labels = [...(mobileList?.querySelectorAll('dt') ?? [])].map(
      (cell) => cell.textContent,
    );

    expect(labels).toEqual(['Inversión (Bs.S)', 'En Binance', 'Resultado (Bs.S)', 'Ganancia (Bs.S)']);
    expect(mobileList?.querySelector('button')?.textContent).not.toContain('Ver detalle');
  });
});
