/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { RateHistoryChart } from './RateHistoryChart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function registerPurchase(): void {
  act(() => {
    useAppStore.getState().recordPurchase(
      {
        mode: 'bs',
        amount: 10_000,
        bcvRate: 900,
        binanceRate: 1_070,
        profile: {
          id: 'profile-chart',
          name: 'Banco Chart',
          cardCommissionPct: 0,
          cardCommissionBase: 'ves',
          binanceDepositPct: 0,
          binanceDepositFixedUsd: 0,
          interbankEnabled: false,
          interbankPct: 0,
          interbankBase: 'initial',
          igtfEnabled: false,
          igtfPct: 0,
          igtfBase: 'investment',
          slippageEnabled: false,
          slippagePct: 0,
          notes: '',
          createdAt: '2026-11-11T12:00:00.000Z',
          updatedAt: '2026-11-11T12:00:00.000Z',
        },
        options: {
          interbankEnabled: false,
          igtfEnabled: false,
          slippageEnabled: false,
        },
      },
      'chart test',
    );
  });
}

function makeHistory(days = 90) {
  const now = new Date();
  const bcv: Array<{ fecha: string; promedio: number }> = [];
  const binance: Array<{ date: string; median_price: number; average_price: number }> = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - index);
    date.setHours(10, 0, 0, 0);
    const iso = date.toISOString();
    bcv.push({ fecha: iso.slice(0, 10), promedio: 900 + index });
    binance.push({ date: iso, median_price: 1_070 + index, average_price: 1_071 + index });
  }

  return { bcv, binance };
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ purchases: [] });
  const history = makeHistory();
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes('ve.dolarapi.com')) {
      return Promise.resolve(jsonResponse(history.bcv));
    }
    if (url.includes('/history/binance')) {
      return Promise.resolve(jsonResponse({ currencies: history.binance }));
    }
    return Promise.resolve(jsonResponse({ currencies: [] }));
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
  vi.unstubAllGlobals();
});

describe('RateHistoryChart', () => {
  it('loads the history cache and renders a chart', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Histórico de tasas y brecha');
    expect(container.textContent).toContain('Binance P2P');

    const thirtyDays = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '30 d',
    );
    expect(thirtyDays).toBeTruthy();

    act(() => {
      thirtyDays?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/history/binance'))).toBe(true);
    expect(urls.some((url) => url.includes('ve.dolarapi.com'))).toBe(true);
    expect(urls.find((url) => url.includes('/history/binance'))).toContain(
      'trade_type=SELL',
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('gives the 90-day range a wider chart with 30-day point spacing', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const ninetyDays = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '90 d',
    );
    expect(ninetyDays).toBeTruthy();

    act(() => {
      ninetyDays?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    const viewBoxWidth = Number(
      (svg?.getAttribute('viewBox') ?? '').split(' ')[2],
    );
    expect(viewBoxWidth).toBeGreaterThan(900);
    expect(Number.parseFloat(svg?.style.width ?? '0')).toBe(viewBoxWidth);

    const hitAreas = container.querySelectorAll('rect[data-hit-area="true"]');
    expect(hitAreas.length).toBe(90);
    expect(Number(hitAreas[1].getAttribute('width'))).toBeGreaterThan(25);
  });

  it('shows BCV price markers with BCV, P2P and gap in that order', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const bcvMarkers = container.querySelectorAll('circle[data-series="bcv"]');
    const p2pMarkers = container.querySelectorAll('circle[data-series="p2p"]');

    expect(bcvMarkers.length).toBeGreaterThan(0);
    expect(p2pMarkers.length).toBeGreaterThan(0);

    const title = bcvMarkers[0].querySelector('title')?.textContent ?? '';
    const bcvIndex = title.indexOf('BCV ');
    const p2pIndex = title.indexOf('P2P ', bcvIndex + 4);
    const gapIndex = title.indexOf('Brecha ', p2pIndex + 4);

    expect(bcvIndex).toBeGreaterThanOrEqual(0);
    expect(p2pIndex).toBeGreaterThan(bcvIndex);
    expect(gapIndex).toBeGreaterThan(p2pIndex);
  });

  it('aligns open and close points vertically in the 7-day range', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const openMarkers = [
      ...container.querySelectorAll('circle[data-series="p2p-open"]'),
    ];
    const closeMarkers = [
      ...container.querySelectorAll('circle[data-series="p2p"]'),
    ];

    expect(openMarkers.length).toBeGreaterThan(0);
    expect(closeMarkers.length).toBe(openMarkers.length);

    openMarkers.forEach((openMarker, index) => {
      expect(closeMarkers[index]?.getAttribute('cx')).toBe(
        openMarker.getAttribute('cx'),
      );
    });
  });

  it('renders one break-even point per day aligned with the daily close', async () => {
    registerPurchase();

    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const breakEvenMarkers = [
      ...container.querySelectorAll('circle[data-series="break-even"]'),
    ];
    const closeMarkers = [
      ...container.querySelectorAll('circle[data-series="p2p"]'),
    ];

    expect(breakEvenMarkers).toHaveLength(7);
    expect(closeMarkers).toHaveLength(7);
    breakEvenMarkers.forEach((marker, index) => {
      expect(marker.getAttribute('cx')).toBe(
        closeMarkers[index]?.getAttribute('cx'),
      );
    });
    expect(container.textContent).toContain('Tasa mínima');
    const title =
      breakEvenMarkers[0]?.querySelector('title')?.textContent ?? '';
    expect(title).toContain('Tasa mínima');
    expect(title).toContain('Bs.S');
  });

  it('shows the price series and gap together in gap mode', async () => {
    registerPurchase();

    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const gapMode = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Brecha %',
    );
    expect(gapMode).toBeTruthy();

    act(() => {
      gapMode?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelectorAll('circle[data-series="p2p-open"]')).toHaveLength(7);
    expect(container.querySelectorAll('circle[data-series="p2p"]')).toHaveLength(7);
    expect(container.querySelectorAll('circle[data-series="bcv"]')).toHaveLength(7);
    expect(container.querySelectorAll('circle[data-series="gap"]')).toHaveLength(7);
    expect(container.querySelectorAll('circle[data-series="break-even"]')).toHaveLength(0);
    expect(container.querySelectorAll('text[data-axis="gap"]')).toHaveLength(5);
    expect(container.textContent).toContain('Rango mín/máx');
    expect(container.textContent).toContain('Brecha %');
    expect(container.textContent).toContain('Precio en el eje izquierdo');
    expect(container.textContent).not.toContain('Tasa mínima');
  });

  it('extends the hover area around points without enlarging the markers', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const hitAreas = container.querySelectorAll('rect[data-hit-area="true"]');
    const bcvMarkers = container.querySelectorAll('circle[data-series="bcv"]');

    expect(hitAreas.length).toBeGreaterThan(0);
    expect(Number(hitAreas[0].getAttribute('width'))).toBeGreaterThan(10);
    expect(Number(hitAreas[0].getAttribute('height'))).toBeGreaterThan(100);

    const title = hitAreas[0].querySelector('title')?.textContent ?? '';
    expect(title).toContain('BCV ');
    expect(title).toContain('P2P ');
    expect(title).toContain('Brecha ');

    bcvMarkers.forEach((marker) => {
      expect(Number(marker.getAttribute('r'))).toBe(3.5);
    });
  });

  it('reuses the cache when switching ranges', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const callsAfterMount = fetchMock.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    for (const label of ['24 h', '30 d', '90 d', '7 d']) {
      const option = [...container.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );
      expect(option).toBeTruthy();

      act(() => {
        option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(fetchMock.mock.calls.length).toBe(callsAfterMount);
  });

  it('reuses the cache across remounts within the TTL', async () => {
    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const callsAfterMount = fetchMock.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    act(() => {
      root?.unmount();
    });
    root = createRoot(container);

    act(() => {
      root?.render(<RateHistoryChart />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.length).toBe(callsAfterMount);
  });
});
