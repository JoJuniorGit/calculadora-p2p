import { Button } from '../ui/Button';
import { promptInstall } from './installSupport';
import { useInstallPromptState } from './useInstallPrompt';
import styles from './pwa.module.css';

function InstallIcon() {
  return (
    <svg
      className={styles.installIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function InstallButton() {
  const state = useInstallPromptState();
  if (state !== 'available') return null;

  return (
    <Button
      variant="secondary"
      className={styles.installButton}
      onClick={() => void promptInstall()}
      aria-label="Instalar la app"
    >
      <InstallIcon />
      <span className={styles.installLabel}>Instalar</span>
    </Button>
  );
}
