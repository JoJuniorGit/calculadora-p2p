import { useId, useRef, useState, type ChangeEvent } from 'react';
import type { PersistedState } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { createConfigJsonExport, downloadTextFile, parseConfigJson } from '../../storage/exportImport';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ToggleField } from '../../components/ui/ToggleField';
import fields from '../../components/ui/fields.module.css';
import styles from './SettingsPanel.module.css';

type Notice = { tone: 'success' | 'error'; message: string };

export function SettingsPanel() {
  const schemaVersion = useAppStore((state) => state.schemaVersion);
  const rates = useAppStore((state) => state.rates);
  const profiles = useAppStore((state) => state.profiles);
  const purchases = useAppStore((state) => state.purchases);
  const disclaimer = useAppStore((state) => state.disclaimer);
  const theme = useAppStore((state) => state.theme);
  const setDisclaimer = useAppStore((state) => state.setDisclaimer);
  const importConfig = useAppStore((state) => state.importConfig);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingConfig, setPendingConfig] = useState<PersistedState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const disclaimerTextId = useId();

  const handleExport = (): void => {
    setNotice(null);
    try {
      const config: PersistedState = {
        schemaVersion,
        rates,
        profiles,
        purchases,
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

      <Card title="Aviso de responsabilidad">
        <div className={styles.disclaimerFields}>
          <ToggleField
            label="Mostrar aviso de responsabilidad"
            checked={disclaimer.enabled}
            onChange={(enabled) => setDisclaimer({ enabled })}
            hint="El aviso está desactivado por defecto y solo se muestra cuando lo habilitas."
          />
          {disclaimer.enabled ? (
            <div className={styles.textareaField}>
              <label className={fields.label} htmlFor={disclaimerTextId}>
                Texto del aviso
              </label>
              <textarea
                id={disclaimerTextId}
                className={fields.textarea}
                value={disclaimer.text}
                onChange={(event) => setDisclaimer({ text: event.currentTarget.value })}
              />
            </div>
          ) : (
            <p className={styles.hiddenNotice}>El aviso está oculto mientras esta opción esté desactivada.</p>
          )}
        </div>
      </Card>

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
