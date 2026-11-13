import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageErrorScreen } from './StorageErrorScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('StorageErrorScreen', () => {
  it('fails closed with a retry action', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(<StorageErrorScreen />);
    });

    expect(container.textContent).toContain(
      'No se pudo abrir el almacenamiento local',
    );
    expect(container.textContent).toContain('no se abrió');
    expect(container.textContent).toContain('no borres los datos del navegador');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Reintentar',
      ),
    ).toBe(true);
  });
});
