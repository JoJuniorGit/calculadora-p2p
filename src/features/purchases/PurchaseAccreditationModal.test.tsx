/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { round2 } from '../../domain/calculations';
import type { BankProfile, CalculationInput } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { PurchaseAccreditationModal } from './PurchaseAccreditationModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;
let purchaseId: string;
let requestedUsd: number;

const timestamp = '2024-01-02T12:00:00.000Z';

function createProfile(overrides: Partial<BankProfile> = {}): BankProfile {
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
    ...overrides,
  };
}

function createInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
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
    ...overrides,
  };
}

const onClose = vi.fn();

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

function toAtmDigits(value: number): string {
  return String(Math.round(value * 100));
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
    rates: {
      bcv: { value: 40, updatedAt: null, source: 'manual' },
      binance: { value: 46, updatedAt: null, source: 'manual' },
    },
    profiles: [],
    purchases: [],
    sales: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: { text: 'Aviso de prueba.', hasSeen: true },
    theme: 'light',
  });
  const record = useAppStore.getState().recordPurchase(createInput());
  purchaseId = record.id;
  requestedUsd = record.requestedUsd;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onClose.mockClear();
  act(() => {
    root?.render(
      <PurchaseAccreditationModal purchaseId={purchaseId} onClose={onClose} />,
    );
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('PurchaseAccreditationModal', () => {
  it('confirms a total accreditation without changing the original values', () => {
    expect(container.textContent).toContain('USD solicitados');
    expect(container.textContent).toContain('Se acreditarán');

    clickButton('Confirmar acreditación');

    const updated = useAppStore.getState().purchases[0];
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updated.status).toBe('approved');
    expect(updated.accreditationType).toBe('TOTAL');
    expect(updated.accreditedUsd).toBe(requestedUsd);
    expect(updated.amountBs).toBe(updated.requestedInvestmentVes);
    expect(updated.refundedVes).toBe(0);
    expect(updated.accreditationConfirmedAt).toBeTruthy();
  });

  it('validates the partial amount and previews the released balance', () => {
    clickButton('Acreditación parcial');
    const input = container.querySelector<HTMLInputElement>(
      'input[name="accredited-usd"]',
    );
    expect(input).not.toBeNull();

    setInputValue(input as HTMLInputElement, toAtmDigits(requestedUsd + 1));
    expect(container.textContent).toContain('No puede superar los USD solicitados');
    const confirm = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Confirmar acreditación',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const half = round2(requestedUsd / 2);
    setInputValue(input as HTMLInputElement, toAtmDigits(half));
    expect(container.textContent).toContain('50,00% de lo solicitado');
    expect(container.textContent).toContain('Bs.S liberados');

    clickButton('Confirmar acreditación');

    const updated = useAppStore.getState().purchases[0];
    expect(updated.accreditationType).toBe('PARTIAL');
    expect(updated.accreditedUsd).toBe(half);
    expect(updated.amountBs).toBe(updated.executedInvestmentVes);
    expect(updated.refundedVes).toBeGreaterThan(0);
    expect(updated.statusHistory[1].note).toContain('Acreditación parcial');
  });

  it('keeps the interbank sunk cost by default and allows releasing it proportionally', () => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    useAppStore.setState({ purchases: [] });
    const record = useAppStore.getState().recordPurchase(
      createInput({
        profile: createProfile({ interbankEnabled: true }),
        options: {
          interbankEnabled: true,
          igtfEnabled: false,
          slippageEnabled: false,
        },
      }),
    );
    purchaseId = record.id;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <PurchaseAccreditationModal purchaseId={purchaseId} onClose={onClose} />,
      );
    });

    const toggle = container.querySelector<HTMLInputElement>(
      'input[role="switch"]',
    );
    expect(toggle?.checked).toBe(true);

    clickButton('Acreditación parcial');
    const input = container.querySelector<HTMLInputElement>(
      'input[name="accredited-usd"]',
    );
    setInputValue(input as HTMLInputElement, toAtmDigits(round2(record.requestedUsd / 2)));
    act(() => {
      toggle?.click();
    });

    clickButton('Confirmar acreditación');

    const updated = useAppStore.getState().purchases[0];
    expect(updated.statusHistory[1].metadata?.keepInterbankSunk).toBe(false);
    expect(updated.statusHistory[1].metadata?.accreditationType).toBe('PARTIAL');
  });
});
