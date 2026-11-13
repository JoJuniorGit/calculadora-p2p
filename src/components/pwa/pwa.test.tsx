import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstallPrompt } from './InstallPrompt';
import { OfflineNotice } from './OfflineNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
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

describe('PWA notices', () => {
  it('shows and hides the offline notice with connectivity events', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      'onLine',
    );
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    act(() => {
      root?.render(<OfflineNotice />);
    });

    expect(container.textContent).toContain('Sin conexión.');

    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(new Event('online'));
    });

    expect(container.textContent).not.toContain('Sin conexión.');

    if (descriptor) {
      Object.defineProperty(Navigator.prototype, 'onLine', descriptor);
    }
  });

  it('offers the Android install prompt and remembers dismissal', () => {
    act(() => {
      root?.render(<InstallPrompt />);
    });

    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({
      outcome: 'dismissed',
      platform: 'web',
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(container.textContent).toContain('Instalar');

    const dismiss = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Ahora no',
    );
    expect(dismiss).toBeTruthy();

    act(() => {
      dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Instalar');
    expect(localStorage.getItem('calculadora-p2p:install-dismissed')).toBe('1');
  });
});
