import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StorageErrorScreen } from './components/StorageErrorScreen';
import { pruneStoredRateHistoryCache } from './features/rates/rateHistoryCache';
import { migrateLegacyStorage } from './storage/indexedDb';
import { useAppStore } from './store/useAppStore';
import { applyTheme } from './utils/theme';
import './styles/global.css';

async function bootstrap(): Promise<void> {
  try {
    const migration = await migrateLegacyStorage();
    if (migration.status === 'failed') {
      console.error('No se pudo migrar el almacenamiento local.', migration.error);
    }
  } catch (error) {
    // A migration failure is non-fatal: rehydration can still use the
    // localStorage fallback from the storage adapter.
    console.error('No se pudo migrar el almacenamiento local.', error);
  }

  let hydrationError: unknown = null;
  try {
    await useAppStore.persist.rehydrate();
    if (!useAppStore.persist.hasHydrated()) {
      throw new Error('La hidratación del almacenamiento no finalizó.');
    }
  } catch (error) {
    hydrationError = error;
    console.error('No se pudo hidratar el estado persistido.', error);
  }

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  if (hydrationError) {
    // Fail closed: never render with defaults, because a later store write
    // could overwrite the real persisted state.
    root.render(
      <React.StrictMode>
        <StorageErrorScreen />
      </React.StrictMode>,
    );
    return;
  }

  applyTheme(useAppStore.getState().theme);

  try {
    await pruneStoredRateHistoryCache();
  } catch (error) {
    console.error('No se pudo podar la caché histórica.', error);
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
