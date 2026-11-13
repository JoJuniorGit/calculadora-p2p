import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import styles from './pwa.module.css';

const INSTALL_DISMISSED_KEY = 'calculadora-p2p:install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isStandaloneMode(): boolean {
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

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasInstallDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(wasInstallDismissed);
  const [standalone, setStandalone] = useState(isStandaloneMode);

  useEffect(() => {
    const handlePrompt = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = (): void => {
      setDeferredPrompt(null);
      setStandalone(true);
    };
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayMode = (): void => setStandalone(isStandaloneMode());

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    media?.addEventListener?.('change', handleDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      media?.removeEventListener?.('change', handleDisplayMode);
    };
  }, []);

  const dismiss = (): void => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // The dismissal remains in memory if storage is unavailable.
    }
  };

  const install = async (): Promise<void> => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') setDismissed(true);
  };

  if (standalone || dismissed) return null;
  if (!deferredPrompt && !isIosDevice()) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <p>
        {isIosDevice()
          ? 'Para instalar: tocá Compartir y luego “Agregar a inicio”.'
          : 'Instalá la app para abrirla más rápido y usarla sin conexión.'}
      </p>
      <div className={styles.actions}>
        {deferredPrompt && (
          <Button onClick={() => void install()}>Instalar</Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </div>
  );
}
