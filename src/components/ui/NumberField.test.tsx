/** @vitest-environment jsdom */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NumberField } from './NumberField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

function Harness({ decimals }: { decimals?: number }) {
  const [value, setValue] = useState('');
  return (
    <NumberField
      label="Monto"
      value={value}
      onChange={setValue}
      decimals={decimals}
    />
  );
}

function getInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

function typeRaw(value: string): void {
  const input = getInput();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('NumberField ATM input', () => {
  it('shifts digits from right to left and formats the display', () => {
    typeRaw('1');
    expect(getInput().value).toBe('0,01');

    typeRaw('0,010');
    expect(getInput().value).toBe('0,10');

    typeRaw('0,100');
    expect(getInput().value).toBe('1,00');

    typeRaw('1,000');
    expect(getInput().value).toBe('10,00');
  });

  it('supports four decimals for rates', () => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(<Harness decimals={4} />);
    });

    typeRaw('9016175');
    expect(getInput().value).toBe('901,6175');
  });

  it('clears a zero value when deleting', () => {
    typeRaw('1');
    expect(getInput().value).toBe('0,01');

    typeRaw('0,0');
    expect(getInput().value).toBe('');
  });
});
