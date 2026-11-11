/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BankProfile } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { CalculatorPanel } from './CalculatorPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

const timestamp = '2024-01-02T12:00:00.000Z';

const profile: BankProfile = {
  id: 'profile-1',
  name: 'Banco Test',
  cardCommissionPct: 2,
  cardCommissionBase: 'usd',
  binanceDepositPct: 1,
  binanceDepositFixedUsd: 0.5,
  interbankEnabled: false,
  interbankPct: 0.3,
  interbankBase: 'initial',
  igtfEnabled: false,
  igtfPct: 3,
  igtfBase: 'card',
  slippageEnabled: false,
  slippagePct: 2,
  notes: '',
  createdAt: timestamp,
  updatedAt: timestamp,
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    rates: {
      bcv: { value: 40, updatedAt: null, source: 'manual' },
      binance: { value: 46, updatedAt: null, source: 'manual' },
    },
    profiles: [profile],
    purchases: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: { enabled: false, text: 'Aviso de prueba.' },
    theme: 'light',
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<CalculatorPanel />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('CalculatorPanel bank profile priority', () => {
  it('places the bank profile before the amount field and explains its role', () => {
    const profileSelect = container.querySelector('select[name="calculator-profile"]');
    const amountInput = container.querySelector('input[name="calculator-amount"]');

    expect(profileSelect).not.toBeNull();
    expect(amountInput).not.toBeNull();
    expect(
      (profileSelect as Element).compareDocumentPosition(amountInput as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain(
      'Los costos y comisiones de esta operación se toman de este perfil.',
    );
  });
});
