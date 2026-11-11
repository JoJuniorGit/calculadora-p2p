import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { PurchaseFilters, PurchaseRecord, PurchaseStatus } from '../../domain/types';
import { getNextStatuses, PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import { computeKpis } from '../../domain/kpis';
import { useAppStore } from '../../store/useAppStore';
import {
  createPurchasesCsvExport,
  createPurchasesJsonExport,
  downloadTextFile,
  parsePurchasesCsv,
  parsePurchasesJson,
} from '../../storage/exportImport';
import { formatBs, formatDate, formatPct, formatUsd } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { SelectField } from '../../components/ui/SelectField';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { filterPurchases } from './purchaseFilters';
import { StatusBadge } from './StatusBadge';
import styles from './PurchasesPanel.module.css';

interface DataNotice {
  tone: 'success' | 'error';
  message: string;
}

interface PurchaseOutcome {
  bsOut: number;
  profitBs: number;
  roiPct: number;
}

function getPurchaseOutcome(purchase: PurchaseRecord): PurchaseOutcome {
  if (purchase.status === 'completed' && purchase.execution) {
    return {
      bsOut: purchase.execution.executedBsOut,
      profitBs: purchase.execution.executedProfitBs,
      roiPct: purchase.execution.executedRoiPct,
    };
  }

  return {
    bsOut: purchase.estimatedBsOut,
    profitBs: purchase.estimatedProfitBs,
    roiPct: purchase.estimatedRoiPct,
  };
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getTodayStamp(): string {
  const today = new Date();
  const year = String(today.getFullYear());
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatImportErrors(errors: string[]): string {
  const visibleErrors = errors.slice(0, 5);
  const remainingCount = errors.length - visibleErrors.length;
  if (remainingCount > 0) visibleErrors.push(`y ${remainingCount} más`);
  return visibleErrors.join('\n');
}

export function PurchasesPanel() {
  const purchases = useAppStore((state) => state.purchases);
  const profiles = useAppStore((state) => state.profiles);
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);
  const resetFilters = useAppStore((state) => state.resetFilters);
  const changePurchaseStatus = useAppStore((state) => state.changePurchaseStatus);
  const deletePurchase = useAppStore((state) => state.deletePurchase);
  const importPurchases = useAppStore((state) => state.importPurchases);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<DataNotice | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const kpis = useMemo(() => computeKpis(purchases), [purchases]);
  const filteredPurchases = useMemo(
    () => filterPurchases(purchases, filters),
    [filters, purchases],
  );
  const profileNames = useMemo(() => {
    const names = new Set<string>();
    for (const purchase of purchases) {
      if (purchase.profileName.trim()) names.add(purchase.profileName);
    }
    for (const profile of profiles) {
      if (profile.name.trim()) names.add(profile.name);
    }
    return [...names];
  }, [profiles, purchases]);

  const statusOptions = [
    { value: 'all', label: 'Todas' },
    ...Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ];
  const bankOptions = [
    { value: 'all', label: 'Todos' },
    ...profileNames.map((name) => ({ value: name, label: name })),
  ];

  const handleExport = (format: 'json' | 'csv'): void => {
    setDataNotice(null);
    try {
      const content =
        format === 'json'
          ? createPurchasesJsonExport(filteredPurchases)
          : createPurchasesCsvExport(filteredPurchases);
      const mime = format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
      downloadTextFile(`compras-p2p-${getTodayStamp()}.${format}`, content, mime);
      setDataNotice({ tone: 'success', message: `Se exportaron ${filteredPurchases.length} resultados filtrados.` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setDataNotice({ tone: 'error', message: `No se pudo exportar el archivo. ${detail}` });
    }
  };

  const handleImportFile = async (file: File): Promise<void> => {
    setDataNotice(null);
    try {
      const text = await file.text();
      const extension = file.name.toLowerCase().split('.').pop();
      const isJson =
        extension === 'json'
          ? true
          : extension === 'csv'
            ? false
            : /^[\s]*[\[{]/.test(text);
      const result = isJson ? parsePurchasesJson(text) : parsePurchasesCsv(text);

      if (!result.ok) {
        const details = formatImportErrors(result.errors);
        setDataNotice({
          tone: 'error',
          message: `No se pudo importar el archivo.\n${details || 'El archivo no contiene registros válidos.'}`,
        });
        return;
      }

      const importedCount = importPurchases(result.data);
      setDataNotice({ tone: 'success', message: `Se importaron ${importedCount} registros.` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setDataNotice({ tone: 'error', message: `No se pudo importar el archivo.\n${detail}` });
    }
  };

  const handleImportInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void handleImportFile(file);
  };

  const handleDelete = (): void => {
    if (!deleteTargetId) return;
    deletePurchase(deleteTargetId);
    setDeleteTargetId(null);
  };

  const handleQuickAdvance = (purchase: PurchaseRecord, nextStatus: PurchaseStatus): void => {
    if (nextStatus === 'completed') {
      setSelectedPurchaseId(purchase.id);
      return;
    }

    setDataNotice(null);
    try {
      changePurchaseStatus(purchase.id, nextStatus);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setDataNotice({
        tone: 'error',
        message: `No se pudo avanzar el estado de la compra. ${detail}`,
      });
    }
  };

  const renderActions = (purchase: PurchaseRecord, mobile = false) => {
    const nextStatus = getNextStatuses(purchase.status).find((status) => status !== 'cancelled');

    return (
      <div className={mobile ? styles.mobileActions : styles.tableActions}>
        <Button
          variant="secondary"
          className={styles.actionButton}
          onClick={() => setSelectedPurchaseId(purchase.id)}
        >
          Ver detalle
        </Button>
        {nextStatus && (
          <Button
            variant="secondary"
            className={styles.actionButton}
            title={
              nextStatus === 'completed'
                ? 'Abre el detalle para registrar la tasa real de venta antes de completar la operación.'
                : `Avanzar a ${PURCHASE_STATUS_LABELS[nextStatus]}`
            }
            onClick={() => handleQuickAdvance(purchase, nextStatus)}
          >
            Avanzar estado
          </Button>
        )}
        <Button
          variant="dangerGhost"
          className={styles.actionButton}
          onClick={() => setDeleteTargetId(purchase.id)}
        >
          Eliminar
        </Button>
      </div>
    );
  };

  const statusFilterValue: PurchaseFilters['status'] = filters.status;

  return (
    <section className={styles.panel} aria-label="Registros de compras">
      <Card title="Resumen contable" className={styles.kpiCardContainer} style={{ overflow: 'visible' }}>
        <div className={styles.kpiGrid}>
          <article className={`${styles.kpiCard} ${styles.primaryKpi}`}>
            <h3 className={styles.kpiLabel}>
              <span>Capital en tránsito</span>
              <InfoTooltip
                label="Información sobre Capital en tránsito"
                content="Operaciones pendientes, con divisas acreditadas o depositadas en Binance"
              />
            </h3>
            <strong className={styles.kpiValue}>{formatBs(kpis.inTransitCapitalBs)}</strong>
            <span className={styles.kpiCount}>
              {formatCount(kpis.inTransitCount, 'operación', 'operaciones')}
            </span>
          </article>

          <article className={`${styles.kpiCard} ${styles.completedKpi}`}>
            <h3 className={styles.kpiLabel}>
              <span>Ganancia líquida acumulada</span>
              <InfoTooltip
                label="Información sobre Ganancia líquida acumulada"
                content="Solo operaciones completadas (ganancia ejecutada)"
              />
            </h3>
            <strong className={styles.kpiValue}>{formatBs(kpis.completedProfitBs)}</strong>
            <span className={styles.kpiCount}>
              {formatCount(kpis.completedCount, 'operación completada', 'operaciones completadas')}
            </span>
          </article>

          <article className={styles.kpiCard}>
            <h3 className={styles.kpiLabel}>
              <span>ROI global ponderado</span>
              <InfoTooltip
                label="Información sobre ROI global ponderado"
                content="Suma de utilidades / suma de costos de operaciones completadas"
              />
            </h3>
            <strong className={styles.kpiValue}>{formatPct(kpis.weightedRoiPct)}</strong>
          </article>

          <article className={`${styles.kpiCard} ${styles.cancelledKpi}`}>
            <h3 className={styles.kpiLabel}>
              <span>Canceladas</span>
              <InfoTooltip
                label="Información sobre Canceladas"
                content="Conteo informativo; se excluyen de todas las sumas"
              />
            </h3>
            <strong className={styles.kpiValue}>{kpis.cancelledCount}</strong>
          </article>
        </div>
      </Card>

      <Card title="Filtros" className={styles.filtersCard}>
        <div className={styles.filtersGrid}>
          <SelectField
            label="Estado"
            value={statusFilterValue}
            onChange={(value) => setFilters({ status: value as PurchaseStatus | 'all' })}
            options={statusOptions}
          />
          <SelectField
            label="Banco"
            value={filters.profileName}
            onChange={(value) => setFilters({ profileName: value })}
            options={bankOptions}
          />
          <label className={styles.dateField}>
            <span className={styles.dateLabel}>Fecha desde</span>
            <input
              className={styles.dateInput}
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters({ dateFrom: event.currentTarget.value })}
            />
          </label>
          <label className={styles.dateField}>
            <span className={styles.dateLabel}>Fecha hasta</span>
            <input
              className={styles.dateInput}
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters({ dateTo: event.currentTarget.value })}
            />
          </label>
          <div className={styles.filterActions}>
            <Button variant="secondary" onClick={resetFilters}>
              Limpiar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Registros"
        className={styles.recordsCard}
        actions={<span className={styles.resultCount}>{filteredPurchases.length} resultados</span>}
      >
        {purchases.length === 0 ? (
          <EmptyState
            title="Todavía no hay compras registradas"
            description="Usa la pestaña Calculadora para simular una operación y registrarla aquí."
          />
        ) : filteredPurchases.length === 0 ? (
          <EmptyState
            title="No hay compras que coincidan con estos filtros"
            description="Prueba otros criterios o limpia los filtros para ver todos los registros."
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.recordsTable}>
                <caption className={styles.tableCaption}>Compras que coinciden con los filtros</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Banco</th>
                    <th scope="col" className={styles.numericHeader}>Invertido</th>
                    <th scope="col" className={styles.numericHeader}>USD depositados</th>
                    <th scope="col" className={styles.numericHeader}>Bs.S de salida</th>
                    <th scope="col" className={styles.numericHeader}>Utilidad</th>
                    <th scope="col" className={styles.numericHeader}>ROI</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((purchase) => {
                    const outcome = getPurchaseOutcome(purchase);
                    return (
                      <tr key={purchase.id}>
                        <td>{formatDate(purchase.createdAt)}</td>
                        <td className={styles.bankCell}>{purchase.profileName}</td>
                        <td className={styles.numericCell}>{formatBs(purchase.amountBs)}</td>
                        <td className={styles.numericCell}>{formatUsd(purchase.usdDeposited)}</td>
                        <td className={styles.numericCell}>{formatBs(outcome.bsOut)}</td>
                        <td className={`${styles.numericCell} ${outcome.profitBs < 0 ? styles.negativeValue : styles.positiveValue}`}>
                          {formatBs(outcome.profitBs)}
                        </td>
                        <td className={styles.numericCell}>{formatPct(outcome.roiPct)}</td>
                        <td><StatusBadge status={purchase.status} /></td>
                        <td>{renderActions(purchase)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.mobileList} aria-label="Registros de compras">
              {filteredPurchases.map((purchase) => {
                const outcome = getPurchaseOutcome(purchase);
                return (
                  <article className={styles.mobileCard} key={purchase.id}>
                    <header className={styles.mobileCardHeader}>
                      <div className={styles.mobileIdentity}>
                        <h3>{purchase.profileName}</h3>
                        <time dateTime={purchase.createdAt}>{formatDate(purchase.createdAt)}</time>
                      </div>
                      <StatusBadge status={purchase.status} />
                    </header>
                    <dl className={styles.mobileDetails}>
                      <div><dt>Invertido</dt><dd>{formatBs(purchase.amountBs)}</dd></div>
                      <div><dt>USD depositados</dt><dd>{formatUsd(purchase.usdDeposited)}</dd></div>
                      <div><dt>Bs.S de salida</dt><dd>{formatBs(outcome.bsOut)}</dd></div>
                      <div>
                        <dt>Utilidad</dt>
                        <dd className={outcome.profitBs < 0 ? styles.negativeValue : styles.positiveValue}>
                          {formatBs(outcome.profitBs)}
                        </dd>
                      </div>
                      <div><dt>ROI</dt><dd>{formatPct(outcome.roiPct)}</dd></div>
                    </dl>
                    {renderActions(purchase, true)}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card title="Datos" className={styles.dataCard}>
        {dataNotice && (
          <p
            className={dataNotice.tone === 'success' ? styles.successNotice : styles.errorNotice}
            role={dataNotice.tone === 'success' ? 'status' : 'alert'}
            aria-live={dataNotice.tone === 'success' ? 'polite' : 'assertive'}
          >
            {dataNotice.message}
          </p>
        )}
        <div className={styles.dataActions}>
          <Button
            variant="secondary"
            disabled={filteredPurchases.length === 0}
            onClick={() => handleExport('json')}
          >
            Exportar JSON
          </Button>
          <Button
            variant="secondary"
            disabled={filteredPurchases.length === 0}
            onClick={() => handleExport('csv')}
          >
            Exportar CSV
          </Button>
          <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
            Importar JSON o CSV
          </Button>
          <input
            ref={importInputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            aria-label="Archivo de registros JSON o CSV"
            onChange={handleImportInputChange}
          />
        </div>
        <p className={styles.dataHint}>
          Las exportaciones incluyen schemaVersion y solo contienen los resultados filtrados. Para importar CSV, usa el formato exportado por esta aplicación.
        </p>
      </Card>

      <PurchaseDetailModal
        purchaseId={selectedPurchaseId}
        onClose={() => setSelectedPurchaseId(null)}
      />
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Eliminar compra"
        message="¿Eliminar esta compra? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </section>
  );
}
