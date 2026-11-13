export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallPromptState = 'available' | 'installed' | 'ios' | 'unavailable';

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let attached = false;
const listeners = new Set<() => void>();
const helpListeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  const standaloneByMedia =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;
  return (
    standaloneByMedia ||
    (navigator as NavigatorWithStandalone).standalone === true
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function getInstallPromptState(): InstallPromptState {
  if (isStandaloneMode()) return 'installed';
  if (deferredPrompt) return 'available';
  if (isIosDevice()) return 'ios';
  return 'unavailable';
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  attachInstallListeners();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function promptInstall(): Promise<
  'accepted' | 'dismissed' | 'unavailable'
> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';

  deferredPrompt = null;
  notify();

  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

export function resetInstallPromptForTests(): void {
  deferredPrompt = null;
  notify();
}

export function requestInstallHelp(): void {
  helpListeners.forEach((listener) => listener());
}

export function subscribeInstallHelp(listener: () => void): () => void {
  helpListeners.add(listener);

  return () => {
    helpListeners.delete(listener);
  };
}

function attachInstallListeners(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if (typeof window.matchMedia === 'function') {
    window
      .matchMedia('(display-mode: standalone)')
      .addEventListener?.('change', () => notify());
  }
}

attachInstallListeners();
