import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { promptInstall, subscribeInstallHelp } from './installSupport';
import { useInstallPromptState } from './useInstallPrompt';
import styles from './pwa.module.css';

const INSTALL_DISMISSED_KEY = 'calculadora-p2p:install-dismissed';

function wasInstallDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const state = useInstallPromptState();
  const [dismissed, setDismissed] = useState(wasInstallDismissed);

  useEffect(
    () => subscribeInstallHelp(() => setDismissed(false)),
    [],
  );

  const dismiss = (): void => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // The dismissal remains in memory if storage is unavailable.
    }
  };

  const install = async (): Promise<void> => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') setDismissed(true);
  };

  if (state === 'installed' || state === 'unavailable' || dismissed) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <p>
        {state === 'ios'
          ? 'Para instalar: tocá Compartir y luego "Agregar a inicio".'
          : 'Instalá la app para abrirla más rápido y usarla sin conexión.'}
      </p>
      <div className={styles.actions}>
        {state === 'available' && (
          <Button onClick={() => void install()}>Instalar</Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </div>
  );
}
