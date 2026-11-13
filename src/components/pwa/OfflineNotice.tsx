import { useEffect, useState } from 'react';
import styles from './pwa.module.css';

export function OfflineNotice() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = (): void => setOffline(false);
    const handleOffline = (): void => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className={`${styles.banner} ${styles.offline}`} role="status">
      <p>
        Sin conexión. Tus datos locales siguen disponibles; las tasas no se
        actualizarán hasta que vuelvas a conectarte.
      </p>
    </div>
  );
}
