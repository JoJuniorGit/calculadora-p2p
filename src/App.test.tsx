import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { ACTIVE_TAB_STORAGE_KEY } from './App';
import { resetInstallPromptForTests } from './components/pwa/installSupport';
import { clearInFlightRatesForTests } from './features/rates/rateRefresh';
import { useAppStore } from './store/useAppStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  clearInFlightRatesForTests();
  resetInstallPromptForTests();
  useAppStore.setState({
    schemaVersion: 1,
    rates: {
      bcv: { value: 40, updatedAt: null, source: 'manual' },
      binance: { value: 46, updatedAt: null, source: 'manual' },
    },
    profiles: [],
    purchases: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: { text: 'Aviso de prueba.', hasSeen: true },
    theme: 'light',
  });
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
  clearInFlightRatesForTests();
  vi.unstubAllGlobals();
});

function clickButton(text: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('client render smoke', () => {
  it('renders all tabs with an empty store', () => {
    act(() => {
      root?.render(<App />);
    });

    expect(container.textContent).toContain('Calculadora P2P');
    const nav = container.querySelector('nav[aria-label="Navegación principal"]');
    expect(nav).not.toBeNull();
    expect(nav?.querySelectorAll('button')).toHaveLength(5);
    expect(container.querySelector('aside[aria-label="Menú lateral"]')).toBeNull();
    expect(container.querySelector('button[aria-controls="app-sidebar"]')).toBeNull();

    expect(container.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(
      'Convertir',
    );

    clickButton('Calculadora');
    expect(container.textContent).toContain('Monto a invertir');
    expect(container.textContent).toContain('La comisión por intervención es fija');
    expect(container.textContent).toContain('No hay perfiles bancarios configurados');

    clickButton('Registros');
    expect(container.textContent).toContain('Capital en tránsito');
    expect(container.textContent).toContain('Compras');
    expect(container.textContent).toContain('Ventas');
    expect(container.textContent).toContain('Todavía no hay compras registradas');
    expect(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)).toBe('records');

    clickButton('Convertir');
    expect(container.textContent).toContain('Conversor de Tasas');
    expect(container.textContent).toContain('Equivalencia y poder de compra');
    expect(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)).toBe('converter');
  });

  it('starts the install flow from the brand mark when available', () => {
    act(() => {
      root?.render(<App />);
    });

    expect(container.querySelector('button[title="Instalar la app"]')).toBeNull();

    const prompt = vi.fn(async () => {});
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    act(() => {
      window.dispatchEvent(event);
    });

    const brandInstall = container.querySelector<HTMLButtonElement>(
      'button[title="Instalar la app"]',
    );
    expect(brandInstall).not.toBeNull();

    act(() => {
      brandInstall?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[title="Instalar la app"]')).toBeNull();
  });

  it('shows the responsibility notice only on the first visit', () => {
    act(() => {
      useAppStore.setState({
        disclaimer: { text: 'Aviso de primera vez.', hasSeen: false },
      });
    });

    act(() => {
      root?.render(<App />);
    });

    expect(container.textContent).toContain('Aviso de primera vez.');
    expect(useAppStore.getState().disclaimer.hasSeen).toBe(true);

    act(() => {
      root?.unmount();
    });
    root = createRoot(container);
    act(() => {
      root?.render(<App />);
    });

    expect(container.textContent).not.toContain('Aviso de primera vez.');
  });

  it('loads missing rates automatically on frontend boot', async () => {
    act(() => {
      useAppStore.setState({
        rates: {
          bcv: { value: 0, updatedAt: null, source: 'manual' },
          binance: { value: 0, updatedAt: null, source: 'manual' },
        },
      });
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/binance-api')) {
        return Promise.resolve(
          jsonResponse({ data: [{ adv: { price: '46.00' } }] }),
        );
      }
      return Promise.resolve(
        jsonResponse([
          { fuente: 'oficial', promedio: 40 },
          { fuente: 'paralelo', promedio: 46 },
        ]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    act(() => {
      root?.render(<App />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(useAppStore.getState().rates.bcv).toMatchObject({
      value: 40,
      source: 'auto',
    });
    expect(useAppStore.getState().rates.binance).toMatchObject({
      value: 46,
      source: 'auto',
    });
    expect(container.textContent).toContain('40,00');
    expect(container.textContent).toContain('46,00');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders storage diagnostics in the rates tab', async () => {
    act(() => {
      root?.render(<App />);
    });

    clickButton('Tasas');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('Almacenamiento y respaldo');
    expect(container.textContent).toContain('Almacenamiento Local');
    expect(container.textContent).toContain('Proteger almacenamiento local');
    expect(container.textContent).not.toContain('Aviso de responsabilidad');
    expect(container.textContent).not.toContain('Backend');
    expect(container.textContent).not.toContain('Migración');
  });
});
