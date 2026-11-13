import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { PersistedState } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import {
  getStorageEstimate,
  isStoragePersisted,
  requestPersistentStorage,
} from '../../storage/indexedDb';
import { createConfigJsonExport, downloadTextFile, parseConfigJson } from '../../storage/exportImport';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import styles from './SettingsPanel.module.css';

type Notice = { tone: 'success' | 'error'; message: string };

interface StorageInfo {
  persisted: boolean;
  estimate: { usage: number; quota: number } | null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function SettingsPanel() {
  const schemaVersion = useAppStore((state) => state.schemaVersion);
  const rates = useAppStore((state) => state.rates);
  const profiles = useAppStore((state) => state.profiles);
  const purchases = useAppStore((state) => state.purchases);
  const sales = useAppStore((state) => state.sales);
  const disclaimer = useAppStore((state) => state.disclaimer);
  const theme = useAppStore((state) => state.theme);
  const importConfig = useAppStore((state) => state.importConfig);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingConfig, setPendingConfig] = useState<PersistedState | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageNotice, setStorageNotice] = useState<Notice | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStorageInfo = async (): Promise<void> => {
    const [persisted, estimate] = await Promise.all([
      isStoragePersisted(),
      getStorageEstimate(),
    ]);

    setStorageInfo({ persisted, estimate });
  };

  useEffect(() => {
    void loadStorageInfo();
  }, []);

  const handlePersistStorage = async (): Promise<void> => {
    setStorageNotice(null);
    const result = await requestPersistentStorage();

    if (result === 'granted') {
      setStorageNotice({
        tone: 'success',
        message: 'La protección del almacenamiento local quedó activada.',
      });
      await loadStorageInfo();
    } else if (result === 'denied') {
      setStorageNotice({
        tone: 'error',
        message:
          'El navegador no concedió la protección del almacenamiento local. Mantené una copia JSON como respaldo.',
      });
    } else {
      setStorageNotice({
        tone: 'error',
        message: 'Este navegador no permite proteger el almacenamiento local.',
      });
    }
  };

  const handleExport = (): void => {
    setNotice(null);
    try {
      const config: PersistedState = {
        schemaVersion,
        rates,
        profiles,
        purchases,
        sales,
        disclaimer,
        theme,
      };
      const content = createConfigJsonExport(config);
      downloadTextFile('calculadora-p2p-config.json', content, 'application/json;charset=utf-8');
      setNotice({ tone: 'success', message: 'La configuración se exportó correctamente.' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setNotice({ tone: 'error', message: `No se pudo exportar la configuración. ${detail}` });
    }
  };

  const handleFile = async (file: File): Promise<void> => {
    setNotice(null);
    try {
      const result = parseConfigJson(await file.text());
      if (!result.ok) {
        setNotice({ tone: 'error', message: result.errors.join(' ') });
        return;
      }

      setPendingConfig(result.data);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setNotice({ tone: 'error', message: `No se pudo leer el archivo JSON. ${detail}` });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void handleFile(file);
  };

  const confirmImport = (): void => {
    if (!pendingConfig) return;

    try {
      importConfig(pendingConfig);
      setPendingConfig(null);
      setNotice({ tone: 'success', message: 'La configuración se importó correctamente.' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setPendingConfig(null);
      setNotice({ tone: 'error', message: `No se pudo importar la configuración. ${detail}` });
    }
  };

  const storagePersistent =
    storageInfo === null
      ? 'Cargando…'
      : storageInfo.persisted
        ? 'Activo'
        : 'No activo';
  const storageUsage =
    storageInfo?.estimate
      ? `${formatBytes(storageInfo.estimate.usage)} de ${formatBytes(storageInfo.estimate.quota)}`
      : 'No disponible';

  return (
    <section className={styles.panel} aria-label="Configuración de la aplicación">
      {notice && (
        <div
          className={notice.tone === 'error' ? styles.errorNotice : styles.successNotice}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
        >
          {notice.message}
        </div>
      )}

      <Card title="Configuración">
        <div className={styles.configActions}>
          <Button variant="secondary" onClick={handleExport}>
            Exportar configuración JSON
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Importar configuración JSON
          </Button>
          <input
            ref={fileInputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".json,application/json"
            aria-label="Archivo de configuración JSON"
            onChange={handleFileChange}
          />
        </div>
        <p className={styles.helpText}>
          La importación reemplaza las tasas, perfiles, registros, aviso y tema guardados.
        </p>
      </Card>

      <Card title="Almacenamiento y respaldo">
        {storageNotice && (
          <div
            className={
              storageNotice.tone === 'error'
                ? styles.errorNotice
                : styles.successNotice
            }
            role={storageNotice.tone === 'error' ? 'alert' : 'status'}
            aria-live={storageNotice.tone === 'error' ? 'assertive' : 'polite'}
          >
            {storageNotice.message}
          </div>
        )}

        <div className={styles.storageGrid}>
          <div className={styles.storageItem}>
            <span className={styles.storageLabel}>Almacenamiento Local</span>
            <strong className={styles.storageValue}>{storagePersistent}</strong>
          </div>
          <div className={styles.storageItem}>
            <span className={styles.storageLabel}>Uso aproximado</span>
            <strong className={styles.storageValue}>{storageUsage}</strong>
          </div>
        </div>

        <div className={styles.storageActions}>
          <Button
            variant="secondary"
            onClick={() => void handlePersistStorage()}
            disabled={storageInfo?.persisted === true}
          >
            Proteger almacenamiento local
          </Button>
        </div>
        <p className={styles.helpText}>
          La exportación JSON es la copia de seguridad recomendada. Guardala fuera
          del navegador; durante esta versión también se conserva una copia de
          respaldo en localStorage.
        </p>
      </Card>

      <ConfirmDialog
        open={pendingConfig !== null}
        title="Confirmar importación"
        message="La importación reemplazará todos los datos guardados. Esta acción no se puede deshacer. ¿Deseas continuar?"
        confirmLabel="Reemplazar datos"
        tone="danger"
        onConfirm={confirmImport}
        onCancel={() => setPendingConfig(null)}
      />
    </section>
  );
}
