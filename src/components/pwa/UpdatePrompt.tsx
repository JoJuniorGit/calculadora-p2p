import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../ui/Button';
import styles from './pwa.module.css';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  const dismiss = (): void => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <p>
        {needRefresh
          ? 'Hay una nueva versión disponible. Actualizá cuando termines lo que estás haciendo.'
          : 'La app ya está lista para funcionar sin conexión.'}
      </p>
      <div className={styles.actions}>
        {needRefresh && (
          <Button onClick={() => void updateServiceWorker(true)}>
            Actualizar
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          {needRefresh ? 'Ahora no' : 'Cerrar'}
        </Button>
      </div>
    </div>
  );
}
