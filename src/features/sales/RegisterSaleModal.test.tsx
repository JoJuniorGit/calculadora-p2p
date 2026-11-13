/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankProfile, CalculationInput } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { RegisterSaleModal } from './RegisterSaleModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

const onClose = vi.fn();
const timestamp = '2024-01-02T12:00:00.000Z';

function createProfile(): BankProfile {
  return {
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
}

function createInput(): CalculationInput {
  return {
    mode: 'usd',
    amount: 300,
    bcvRate: 40,
    binanceRate: 46,
    profile: createProfile(),
    options: {
      interbankEnabled: false,
      igtfEnabled: false,
      slippageEnabled: false,
    },
  };
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

function getSpinbuttons(): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[role="spinbutton"]')];
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

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    purchases: [],
    sales: [],
    profiles: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    rates: {
      bcv: { value: 40, updatedAt: null, source: 'manual' },
      binance: { value: 46, updatedAt: null, source: 'manual' },
    },
  });
  const record = useAppStore.getState().recordPurchase(createInput());
  useAppStore.getState().accreditPurchase(record.id, {
    accreditationType: 'TOTAL',
    accreditedUsd: record.requestedUsd,
    keepInterbankSunk: true,
  });
  useAppStore.getState().changePurchaseStatus(record.id, 'usd_credited');
  useAppStore.getState().changePurchaseStatus(record.id, 'deposited_binance');

  onClose.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<RegisterSaleModal open onClose={onClose} />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('RegisterSaleModal', () => {
  it('previews FIFO consumption and registers a sale', () => {
    const [usdtInput, rateInput] = getSpinbuttons();
    setInputValue(usdtInput as HTMLInputElement, '10000');
    setInputValue(rateInput as HTMLInputElement, '10800000');

    expect(container.textContent).toContain('VES recibidos');
    expect(container.textContent).toContain('107.935,20 Bs.S');
    expect(container.textContent).toContain('Costo FIFO asignado');
    expect(container.textContent).toContain('Ganancia realizada');

    const confirm = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Confirmar venta',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);

    clickButton('Confirmar venta');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().sales).toHaveLength(1);
    expect(useAppStore.getState().purchases[0].status).toBe('partial');
    expect(useAppStore.getState().purchases[0].allocations).toHaveLength(1);
  });

  it('keeps the confirmation disabled without an inventory or valid amounts', () => {
    const confirm = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Confirmar venta',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const [usdtInput, rateInput] = getSpinbuttons();
    setInputValue(usdtInput as HTMLInputElement, '999900');
    setInputValue(rateInput as HTMLInputElement, '10800000');

    expect(container.textContent).toContain('Saldo insuficiente');
    expect(confirm.disabled).toBe(true);
  });
});
