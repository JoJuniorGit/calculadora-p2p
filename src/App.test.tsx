import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { useAppStore } from './store/useAppStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    schemaVersion: 1,
    rates: {
      bcv: { value: 40, updatedAt: null, source: 'manual' },
      binance: { value: 46, updatedAt: null, source: 'manual' },
    },
    profiles: [],
    purchases: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: { enabled: false, text: 'Aviso de prueba.' },
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
  it('renders all tabs with demo data and computed results', () => {
    act(() => {
      useAppStore.getState().loadDemoData();
    });
    act(() => {
      root?.render(<App />);
    });

    expect(container.textContent).toContain('Calculadora P2P');

    clickButton('Calculadora');
    expect(container.textContent).toContain('Monto a invertir');
    expect(container.textContent).toContain('La comisión por intervención es fija');
    expect(container.textContent).toContain('Banco Demo');

    clickButton('Registros');
    expect(container.textContent).toContain('Banco Demo');
    expect(container.textContent).toContain('Capital en tránsito');
    expect(container.textContent).toContain('Vendido/Completado');
  });
});
