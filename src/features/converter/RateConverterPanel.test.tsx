/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { RateConverterPanel } from './RateConverterPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

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

function selectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  )?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function getInput(name: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
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
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<RateConverterPanel />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('RateConverterPanel', () => {
  it('formats the edited field with ATM digits and updates the two passive fields', () => {
    setInputValue(getInput('converter-ves'), '1173000');

    expect(getInput('converter-ves').value).toBe('11.730,00');
    expect(getInput('converter-slot-1').value).toBe('293,25');
    expect(getInput('converter-slot-2').value).toBe('255,00');
    expect(container.textContent).toContain('Diferencia: 38,25 USD');
  });

  it('shifts typed digits from right to left in the active field', () => {
    setInputValue(getInput('converter-ves'), '1');
    expect(getInput('converter-ves').value).toBe('0,01');

    setInputValue(getInput('converter-ves'), '0,015');
    expect(getInput('converter-ves').value).toBe('0,15');
  });

  it('selects the current value on focus and replaces it with the typed digits', () => {
    setInputValue(getInput('converter-ves'), '1173000');
    const slot1 = getInput('converter-slot-1');
    act(() => {
      slot1.focus();
    });

    expect(slot1.value).toBe('293,25');
    expect(slot1.selectionStart).toBe(0);
    expect(slot1.selectionEnd).toBe(slot1.value.length);

    setInputValue(slot1, '5');

    expect(getInput('converter-slot-1').value).toBe('0,05');
    expect(getInput('converter-ves').value).toBe('2,00');
  });

  it('ignores the previous value when typing appends after focus', () => {
    setInputValue(getInput('converter-ves'), '1173000');
    const slot1 = getInput('converter-slot-1');
    act(() => {
      slot1.focus();
    });

    setInputValue(slot1, '293,255');

    expect(getInput('converter-slot-1').value).toBe('0,05');
  });

  it('clears the whole prefilled value on delete', () => {
    setInputValue(getInput('converter-ves'), '1173000');
    const slot1 = getInput('converter-slot-1');
    act(() => {
      slot1.focus();
    });

    setInputValue(slot1, '');

    expect(getInput('converter-slot-1').value).toBe('');
    expect(getInput('converter-ves').value).toBe('');
    expect(getInput('converter-slot-2').value).toBe('');
  });

  it('swaps the slot rates when picking the rate already used by the other slot', () => {
    const slot1Select = container.querySelector<HTMLSelectElement>(
      'select[name="converter-slot-1-rate"]',
    );
    const slot2Select = container.querySelector<HTMLSelectElement>(
      'select[name="converter-slot-2-rate"]',
    );
    expect(slot1Select).not.toBeNull();
    expect(slot2Select).not.toBeNull();
    if (!slot1Select || !slot2Select) return;

    expect(slot1Select.value).toBe('BCV');
    expect(slot2Select.value).toBe('BINANCE');

    selectValue(slot1Select, 'BINANCE');

    expect(slot1Select.value).toBe('BINANCE');
    expect(slot2Select.value).toBe('BCV');
  });

  it('clears all three fields when the active input is emptied', () => {
    setInputValue(getInput('converter-ves'), '1173000');
    expect(getInput('converter-slot-2').value).toBe('255,00');

    setInputValue(getInput('converter-ves'), '');

    expect(getInput('converter-ves').value).toBe('');
    expect(getInput('converter-slot-1').value).toBe('');
    expect(getInput('converter-slot-2').value).toBe('');
  });

  it('applies quick USD amounts to the primary USD slot', () => {
    clickButton('$100');

    expect(getInput('converter-slot-1').value).toBe('100,00');
    expect(getInput('converter-ves').value).toBe('4.000,00');
    expect(getInput('converter-slot-2').value).toBe('86,96');
  });

  it('shows the 100 USD reference metrics before any amount is entered', () => {
    expect(container.textContent).toContain('Referencia por cada $100 USD');
    expect(container.textContent).toContain('Liquidación P2P necesaria');
    expect(container.textContent).toContain('Poder de compra extra');
    expect(container.textContent).toContain('Diferencia: 13,04 USD');
    expect(container.textContent).toContain('Dólar BCV');
    expect(container.textContent).not.toContain('Divisa Slot');
  });

  it('swaps both slot rates with the exchange button', () => {
    const swapButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Intercambiar tasas de los slots"]',
    );
    const slot1Select = container.querySelector<HTMLSelectElement>(
      'select[name="converter-slot-1-rate"]',
    );
    const slot2Select = container.querySelector<HTMLSelectElement>(
      'select[name="converter-slot-2-rate"]',
    );
    expect(swapButton).not.toBeNull();
    expect(slot1Select).not.toBeNull();
    expect(slot2Select).not.toBeNull();
    if (!swapButton || !slot1Select || !slot2Select) return;

    act(() => {
      swapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(slot1Select.value).toBe('BINANCE');
    expect(slot2Select.value).toBe('BCV');
  });

  it('marks the pressed quick-amount chip', () => {
    clickButton('$50');
    const chip = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === '$50',
    );

    expect(chip?.getAttribute('aria-pressed')).toBe('true');
  });
});
