import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
import {
  formatAmount,
  formatBs,
  formatDate,
  formatDateOnly,
  formatPct,
  formatUsd,
  toLocalDateKey,
} from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { SelectField } from '../../components/ui/SelectField';
import { PurchaseAccreditationModal } from './PurchaseAccreditationModal';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { PurchaseRowActions } from './PurchaseRowActions';
import { RegisterSaleModal } from '../sales/RegisterSaleModal';
import { SaleDetailModal } from '../sales/SaleDetailModal';
import { filterPurchases } from './purchaseFilters';
import { StatusBadge } from './StatusBadge';
import styles from './PurchasesPanel.module.css';
import salesStyles from '../sales/sales.module.css';

interface DataNotice {
  tone: 'success' | 'error';
  message: string;
}

const PURCHASE_PAGE_SIZE = 10;
const SALES_PAGE_SIZE = 10;

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange(page: number): void;
  label: string;
}

function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  label,
}: PaginationProps) {
  if (totalItems === 0) return null;

  return (
    <div className={styles.pagination} aria-label={label}>
      <span className={styles.paginationInfo} aria-live="polite">
        Página {page} de {totalPages}
      </span>
      <div className={styles.paginationActions}>
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

interface PurchaseOutcome {
  bsOut: number;
  profitBs: number;
  roiPct: number;
}

function getPurchaseOutcome(purchase: PurchaseRecord): PurchaseOutcome | null {
  if (
    (purchase.status === 'completed' || purchase.status === 'partial') &&
    purchase.realizedRevenueVes !== undefined
  ) {
    const allocatedCost = purchase.allocatedCostVesTotal ?? 0;
    return {
      bsOut: purchase.realizedRevenueVes,
      profitBs: purchase.realizedProfitVes ?? 0,
      roiPct:
        allocatedCost > 0
          ? ((purchase.realizedProfitVes ?? 0) / allocatedCost) * 100
          : 0,
    };
  }

  if (purchase.status === 'completed' && purchase.execution) {
    return {
      bsOut: purchase.execution.executedBsOut,
      profitBs: purchase.execution.executedProfitBs,
      roiPct: purchase.execution.executedRoiPct,
    };
  }

  return null;
}

function getSaleRate(purchase: PurchaseRecord): number {
  if (purchase.execution?.realBinanceRate) return purchase.execution.realBinanceRate;
  if ((purchase.weightedAverageSellRateVes ?? 0) > 0) {
    return purchase.weightedAverageSellRateVes as number;
  }

  const snapshotRate = purchase.snapshot.binanceRate || purchase.binanceRate;
  return purchase.snapshot.slippageEnabled
    ? snapshotRate * (1 - purchase.snapshot.slippagePct / 100)
    : snapshotRate;
}

function toUsdEquivalent(valueBs: number, rate: number): number {
  return rate > 0 ? valueBs / rate : 0;
}

function getInventoryData(purchase: PurchaseRecord): {
  remainingUsdt: number;
  initialUsdt: number;
  remainingCostVes: number;
} | null {
  if (
    purchase.status !== 'deposited_binance' &&
    purchase.status !== 'partial' &&
    purchase.status !== 'completed'
  ) {
    return null;
  }

  const initialUsdt =
    purchase.initialBinanceUsdt ??
    (purchase.status === 'deposited_binance' ? purchase.usdDeposited : 0);
  if (initialUsdt <= 0) return null;

  return {
    initialUsdt,
    remainingUsdt:
      purchase.remainingBinanceUsdt ??
      (purchase.status === 'deposited_binance' ? initialUsdt : 0),
    remainingCostVes:
      purchase.remainingCostVes ??
      (purchase.status === 'deposited_binance' ? purchase.totalCostBs : 0),
  };
}

function MoneyStack({
  primary,
  secondary,
  tone = 'neutral',
}: {
  primary: string;
  secondary: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive'
      ? styles.positiveValue
      : tone === 'negative'
        ? styles.negativeValue
        : undefined;

  return (
    <span className={styles.currencyStack}>
      <span className={`${styles.primaryAmount} ${toneClass ?? ''}`}>{primary}</span>
      <span className={styles.secondaryAmount}>{secondary}</span>
    </span>
  );
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatUsdt(value: number): string {
  return `${formatAmount(value)} USDT`;
}

function getPurchaseDateLabel(purchase: PurchaseRecord): string {
  return purchase.purchaseDate
    ? formatDateOnly(purchase.purchaseDate)
    : formatDate(purchase.createdAt);
}

function getPurchaseDateTime(purchase: PurchaseRecord): string {
  return purchase.purchaseDate ?? purchase.createdAt;
}

function getPurchaseRateSourceLabel(purchase: PurchaseRecord): string {
  if (purchase.rateReference?.source === 'historical') return 'Histórica';
  if (purchase.rateReference?.source === 'manual') return 'Manual';
  if (!purchase.purchaseDate) return 'Legada';
  return toLocalDateKey(purchase.createdAt) === purchase.purchaseDate
    ? 'En vivo'
    : 'Histórica';
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

function getPartialAccreditationTitle(purchase: PurchaseRecord): string {
  return `Solicitado: ${formatUsd(purchase.requestedUsd)} (${formatBs(purchase.requestedInvestmentVes)}) | Aprobado: ${formatUsd(purchase.accreditedUsd)} | Liberado: ${formatBs(purchase.refundedVes)}`;
}

export function PurchasesPanel() {
  const purchases = useAppStore((state) => state.purchases);
  const sales = useAppStore((state) => state.sales);
  const profiles = useAppStore((state) => state.profiles);
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);
  const resetFilters = useAppStore((state) => state.resetFilters);
  const changePurchaseStatus = useAppStore((state) => state.changePurchaseStatus);
  const deletePurchase = useAppStore((state) => state.deletePurchase);
  const deleteSale = useAppStore((state) => state.deleteSale);
  const importPurchases = useAppStore((state) => state.importPurchases);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [accreditationTargetId, setAccreditationTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [deleteSaleTargetId, setDeleteSaleTargetId] = useState<string | null>(null);
  const [registerSaleOpen, setRegisterSaleOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<DataNotice | null>(null);
  const [recordView, setRecordView] = useState<'purchases' | 'sales'>('purchases');
  const [purchasePage, setPurchasePage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const importInputRef = useRef<HTMLInputElement>(null);

  const kpis = useMemo(() => computeKpis(purchases), [purchases]);
  const transitCount = useMemo(
    () =>
      purchases.filter(
        (purchase) => purchase.status === 'pending' || purchase.status === 'approved',
      ).length,
    [purchases],
  );
  const bankCount = useMemo(
    () => purchases.filter((purchase) => purchase.status === 'usd_credited').length,
    [purchases],
  );
  const binanceCount = useMemo(
    () =>
      purchases.filter(
        (purchase) =>
          purchase.status === 'deposited_binance' || purchase.status === 'partial',
      ).length,
    [purchases],
  );
  const filteredPurchases = useMemo(
    () => filterPurchases(purchases, filters),
    [filters, purchases],
  );
  const purchaseTotalPages = Math.max(
    1,
    Math.ceil(filteredPurchases.length / PURCHASE_PAGE_SIZE),
  );
  const safePurchasePage = Math.min(purchasePage, purchaseTotalPages);
  const pagedPurchases = useMemo(
    () =>
      filteredPurchases.slice(
        (safePurchasePage - 1) * PURCHASE_PAGE_SIZE,
        safePurchasePage * PURCHASE_PAGE_SIZE,
      ),
    [filteredPurchases, safePurchasePage],
  );
  const salesTotalPages = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
  const safeSalesPage = Math.min(salesPage, salesTotalPages);
  const pagedSales = useMemo(
    () =>
      sales.slice(
        (safeSalesPage - 1) * SALES_PAGE_SIZE,
        safeSalesPage * SALES_PAGE_SIZE,
      ),
    [safeSalesPage, sales],
  );
  useEffect(() => {
    setPurchasePage(1);
  }, [filters]);
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
    setDataNotice(null);
    try {
      deletePurchase(deleteTargetId);
      setDeleteTargetId(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setDataNotice({ tone: 'error', message: detail });
      setDeleteTargetId(null);
    }
  };

  const handleDeleteSale = (): void => {
    if (!deleteSaleTargetId) return;
    setDataNotice(null);
    try {
      deleteSale(deleteSaleTargetId);
      setDeleteSaleTargetId(null);
      setSelectedSaleId(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setDataNotice({ tone: 'error', message: detail });
      setDeleteSaleTargetId(null);
    }
  };

  const handleQuickAdvance = (purchase: PurchaseRecord, nextStatus: PurchaseStatus): void => {
    if (nextStatus === 'approved') {
      setAccreditationTargetId(purchase.id);
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

  const statusFilterValue: PurchaseFilters['status'] = filters.status;
  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.profileName !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  return (
    <section className={styles.panel} aria-label="Registros de compras">
      <Card title="Resumen contable" className={styles.kpiCardContainer} style={{ overflow: 'visible' }}>
        <div className={styles.kpiGrid}>
          <article className={`${styles.kpiCard} ${styles.primaryKpi}`}>
            <h3 className={styles.kpiLabel}>
              <span>Capital en tránsito</span>
              <InfoTooltip
                label="Información sobre Capital en tránsito"
                content="Costo solicitado en EN_ESPERA más costo ejecutado en APROBADO. Valor principal en USD; equivalente en Bs.S debajo."
              />
            </h3>
            <strong className={styles.kpiValue}>{formatUsd(kpis.capitalInTransitUsd)}</strong>
            <span className={styles.kpiSecondary}>{formatBs(kpis.capitalInTransitVes)}</span>
            <span className={styles.kpiCount}>
              {formatCount(transitCount, 'operación', 'operaciones')}
            </span>
          </article>

          <article className={styles.kpiCard}>
            <h3 className={styles.kpiLabel}>
              <span>Capital en banca</span>
              <InfoTooltip
                label="Información sobre Capital en banca"
                content="Costo ejecutado de operaciones ACREDITADO aún no depositadas en Binance. Valor principal en USD; equivalente en Bs.S debajo."
              />
            </h3>
            <strong className={styles.kpiValue}>{formatUsd(kpis.capitalInBankUsd)}</strong>
            <span className={styles.kpiSecondary}>{formatBs(kpis.capitalInBankVes)}</span>
            <span className={styles.kpiCount}>
              {formatCount(bankCount, 'operación', 'operaciones')}
            </span>
          </article>

          <article className={styles.kpiCard}>
            <h3 className={styles.kpiLabel}>
              <span>Capital en Binance</span>
              <InfoTooltip
                label="Información sobre Capital en Binance"
                content="Costo remanente de lotes EN_BINANCE y PARCIAL. Valor principal en USDT; equivalente en Bs.S debajo."
              />
            </h3>
            <strong className={styles.kpiValue}>{formatUsdt(kpis.capitalInBinanceUsdt)}</strong>
            <span className={styles.kpiSecondary}>{formatBs(kpis.capitalInBinanceVes)}</span>
            <span className={styles.kpiCount}>
              {formatCount(binanceCount, 'lote', 'lotes')}
            </span>
          </article>

          <article className={`${styles.kpiCard} ${styles.completedKpi}`}>
            <h3 className={styles.kpiLabel}>
              <span>Ganancia realizada</span>
              <InfoTooltip
                label="Información sobre Ganancia realizada"
                content="Suma de ganancias realizadas por ventas FIFO, incluyendo operaciones parciales. Valor principal en USDT; equivalente en Bs.S debajo."
              />
            </h3>
            <strong className={styles.kpiValue}>{formatUsdt(kpis.realizedProfitUsdt)}</strong>
            <span className={styles.kpiSecondary}>{formatBs(kpis.realizedProfitVes)}</span>
            <span className={styles.kpiCount}>
              ROI realizado {formatPct(kpis.realizedRoiPct)}
            </span>
          </article>
        </div>
      </Card>

      <div className={styles.recordTabs} role="group" aria-label="Tipo de registros">
        <button
          className={`${styles.recordTab} ${
            recordView === 'purchases' ? styles.recordTabActive : ''
          }`}
          type="button"
          aria-pressed={recordView === 'purchases'}
          onClick={() => setRecordView('purchases')}
        >
          Compras <span className={styles.recordTabCount}>{purchases.length}</span>
        </button>
        <button
          className={`${styles.recordTab} ${
            recordView === 'sales' ? styles.recordTabActive : ''
          }`}
          type="button"
          aria-pressed={recordView === 'sales'}
          onClick={() => setRecordView('sales')}
        >
          Ventas <span className={styles.recordTabCount}>{sales.length}</span>
        </button>
      </div>

      {recordView === 'purchases' && (
      <>
      <div className={styles.filterToolbar} role="search" aria-label="Filtros de compras">
        <span className={styles.filterLead}>
          <svg
            className={styles.filterIcon}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3 5h14M6 10h8M8 15h4" />
          </svg>
          Filtros:
        </span>
        <SelectField
          inline
          label="Estado"
          value={statusFilterValue}
          onChange={(value) => setFilters({ status: value as PurchaseStatus | 'all' })}
          options={statusOptions}
        />
        <SelectField
          inline
          label="Banco"
          value={filters.profileName}
          onChange={(value) => setFilters({ profileName: value })}
          options={bankOptions}
        />
        <div className={styles.dateRange} aria-label="Rango de fechas">
          <label className={styles.inlineDate}>
            <span>Desde</span>
            <input
              className={styles.compactDateInput}
              type="date"
              aria-label="Fecha desde"
              value={filters.dateFrom}
              onChange={(event) => setFilters({ dateFrom: event.currentTarget.value })}
            />
          </label>
          <span className={styles.dateSeparator} aria-hidden="true">a</span>
          <label className={styles.inlineDate}>
            <span>Hasta</span>
            <input
              className={styles.compactDateInput}
              type="date"
              aria-label="Fecha hasta"
              value={filters.dateTo}
              onChange={(event) => setFilters({ dateTo: event.currentTarget.value })}
            />
          </label>
        </div>
        <Button
          variant="ghost"
          className={styles.clearFilters}
          onClick={resetFilters}
          disabled={!hasActiveFilters}
        >
          ✕ Limpiar
        </Button>
      </div>

      <Card
        title="Compras"
        className={styles.recordsCard}
        actions={
          <span className={styles.resultCount}>{filteredPurchases.length} resultados</span>
        }
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
              <table className={styles.recordsTable} aria-label="Compras registradas">
                <thead>
                  <tr>
                    <th scope="col">Banco</th>
                    <th scope="col" className={styles.numericHeader}>Inversión</th>
                    <th scope="col" className={styles.numericHeader}>En Binance</th>
                    <th scope="col" className={styles.numericHeader}>Resultado</th>
                    <th scope="col" className={styles.numericHeader}>Utilidad</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className={styles.actionsCell}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPurchases.map((purchase) => {
                    const outcome = getPurchaseOutcome(purchase);
                    const inventory = getInventoryData(purchase);
                    const saleRate = getSaleRate(purchase);
                    const nextStatus = getNextStatuses(purchase.status).find((status) => status !== 'cancelled') ?? null;
                    return (
                      <tr key={purchase.id}>
                        <td className={styles.bankCell}>
                          <span className={styles.bankName}>{purchase.profileName}</span>
                          <time
                            className={styles.purchaseDate}
                            dateTime={getPurchaseDateTime(purchase)}
                          >
                            {getPurchaseDateLabel(purchase)}
                          </time>
                          <span className={styles.purchaseRateSource}>
                            {getPurchaseRateSourceLabel(purchase)}
                          </span>
                        </td>
                        <td className={styles.numericCell}>
                          <span className={styles.numericStack}>
                            <MoneyStack
                              primary={formatBs(purchase.totalCostBs)}
                              secondary={formatUsd(purchase.usdBought)}
                            />
                            {purchase.accreditationType === 'PARTIAL' && (
                              <span
                                className={styles.partialBadge}
                                title={getPartialAccreditationTitle(purchase)}
                              >
                                Parcial ({formatPct(purchase.accreditationRatePercent)})
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={styles.numericCell}>
                          {inventory ? (
                            <MoneyStack
                              primary={formatUsdt(inventory.remainingUsdt)}
                              secondary={formatBs(inventory.remainingCostVes)}
                            />
                          ) : (
                            '-'
                          )}
                        </td>
                        <td
                          className={styles.numericCell}
                          aria-label={outcome ? undefined : 'Resultado pendiente de venta'}
                        >
                          {outcome && (
                            <MoneyStack
                              primary={formatBs(outcome.bsOut)}
                              secondary={formatUsd(toUsdEquivalent(outcome.bsOut, saleRate))}
                            />
                          )}
                        </td>
                        <td
                          className={`${styles.numericCell} ${styles.emphasisCell}`}
                          aria-label={
                            purchase.status === 'completed' && outcome
                              ? undefined
                              : 'Utilidad disponible al completar la venta'
                          }
                        >
                          {purchase.status === 'completed' && outcome && (
                            <MoneyStack
                              primary={formatUsd(toUsdEquivalent(outcome.profitBs, saleRate))}
                              secondary={formatPct(outcome.roiPct)}
                              tone={outcome.profitBs < 0 ? 'negative' : 'positive'}
                            />
                          )}
                        </td>
                        <td><StatusBadge status={purchase.status} /></td>
                        <td className={styles.actionsCell}>
                          <PurchaseRowActions
                            purchaseLabel={`${purchase.profileName}, ${getPurchaseDateLabel(purchase)}`}
                            nextStatus={nextStatus}
                            open={openActionsId === purchase.id}
                            onOpenChange={(open) => setOpenActionsId(open ? purchase.id : null)}
                            onViewDetail={() => setSelectedPurchaseId(purchase.id)}
                            onAdvance={() => {
                              if (nextStatus) handleQuickAdvance(purchase, nextStatus);
                            }}
                            onDelete={() => setDeleteTargetId(purchase.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.mobileList} aria-label="Registros de compras">
              {pagedPurchases.map((purchase) => {
                const outcome = getPurchaseOutcome(purchase);
                const inventory = getInventoryData(purchase);
                const saleRate = getSaleRate(purchase);
                const nextStatus = getNextStatuses(purchase.status).find((status) => status !== 'cancelled') ?? null;
                return (
                  <article className={styles.mobileCard} key={purchase.id}>
                    <header className={styles.mobileCardHeader}>
                      <div className={styles.mobileIdentity}>
                        <h3>{purchase.profileName}</h3>
                         <time dateTime={getPurchaseDateTime(purchase)}>
                           {getPurchaseDateLabel(purchase)}
                         </time>
                         <span className={styles.purchaseRateSource}>
                           {getPurchaseRateSourceLabel(purchase)}
                         </span>
                      </div>
                      <div className={styles.mobileStatusActions}>
                        <StatusBadge status={purchase.status} />
                        <PurchaseRowActions
                           purchaseLabel={`${purchase.profileName}, ${getPurchaseDateLabel(purchase)}`}
                          nextStatus={nextStatus}
                          open={openActionsId === purchase.id}
                          onOpenChange={(open) => setOpenActionsId(open ? purchase.id : null)}
                          onViewDetail={() => setSelectedPurchaseId(purchase.id)}
                          onAdvance={() => {
                            if (nextStatus) handleQuickAdvance(purchase, nextStatus);
                          }}
                          onDelete={() => setDeleteTargetId(purchase.id)}
                        />
                      </div>
                    </header>
                    <dl className={styles.mobileDetails}>
                      <div>
                        <dt>Inversión</dt>
                        <dd className={styles.mobileValueStack}>
                          <MoneyStack
                            primary={formatBs(purchase.totalCostBs)}
                            secondary={formatUsd(purchase.usdBought)}
                          />
                          {purchase.accreditationType === 'PARTIAL' && (
                            <span
                              className={styles.partialBadge}
                              title={getPartialAccreditationTitle(purchase)}
                            >
                              Parcial ({formatPct(purchase.accreditationRatePercent)})
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>En Binance</dt>
                        <dd>
                          {inventory ? (
                            <MoneyStack
                              primary={formatUsdt(inventory.remainingUsdt)}
                              secondary={formatBs(inventory.remainingCostVes)}
                            />
                          ) : (
                            '-'
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Resultado</dt>
                        <dd
                          aria-label={outcome ? undefined : 'Resultado pendiente de venta'}
                        >
                          {outcome && (
                            <MoneyStack
                              primary={formatBs(outcome.bsOut)}
                              secondary={formatUsd(toUsdEquivalent(outcome.bsOut, saleRate))}
                            />
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Utilidad</dt>
                        <dd
                          className={styles.emphasisCell}
                          aria-label={
                            purchase.status === 'completed' && outcome
                              ? undefined
                              : 'Utilidad disponible al completar la venta'
                          }
                        >
                          {purchase.status === 'completed' && outcome && (
                            <MoneyStack
                              primary={formatUsd(toUsdEquivalent(outcome.profitBs, saleRate))}
                              secondary={formatPct(outcome.roiPct)}
                              tone={outcome.profitBs < 0 ? 'negative' : 'positive'}
                            />
                          )}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </>
        )}
        {filteredPurchases.length > 0 && (
          <Pagination
            page={safePurchasePage}
            totalPages={purchaseTotalPages}
            totalItems={filteredPurchases.length}
            onPageChange={setPurchasePage}
            label="Paginación de compras"
          />
        )}
      </Card>
      </>
      )}

      {recordView === 'sales' && (
      <Card
        title="Ventas"
        className={salesStyles.salesCard}
        actions={
          <Button variant="secondary" onClick={() => setRegisterSaleOpen(true)}>
            Registrar venta P2P
          </Button>
        }
      >
        {sales.length === 0 ? (
          <p className={salesStyles.emptySales}>
            Aún no hay ventas registradas. Registra una venta para liquidar los lotes FIFO y
            calcular la ganancia realizada.
          </p>
        ) : (
          <>
            <div className={salesStyles.salesTableWrap}>
              <table className={salesStyles.salesTable} aria-label="Ventas P2P registradas">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col" className={salesStyles.numericHeader}>USDT vendidos</th>
                    <th scope="col" className={salesStyles.numericHeader}>Tasa</th>
                    <th scope="col" className={salesStyles.numericHeader}>VES recibidos</th>
                    <th scope="col" className={salesStyles.numericHeader}>Costo FIFO</th>
                    <th scope="col" className={salesStyles.numericHeader}>Ganancia</th>
                    <th scope="col" className={salesStyles.numericHeader}>ROI</th>
                    <th scope="col" className={salesStyles.numericHeader}>Saldo</th>
                    <th scope="col" className={salesStyles.numericHeader}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{formatDate(sale.createdAt)}</td>
                      <td className={salesStyles.numericCell}>{formatAmount(sale.totalUsdtSold)}</td>
                      <td className={salesStyles.numericCell}>{formatAmount(sale.sellRateVes)}</td>
                      <td className={salesStyles.numericCell}>{formatAmount(sale.totalVesReceived)}</td>
                      <td className={salesStyles.numericCell}>{formatAmount(sale.totalAllocatedCostVes)}</td>
                      <td
                        className={`${salesStyles.numericCell} ${
                          sale.totalRealizedProfitVes < 0
                            ? styles.negativeValue
                            : styles.positiveValue
                        }`}
                      >
                        {formatAmount(sale.totalRealizedProfitVes)}
                      </td>
                      <td className={salesStyles.numericCell}>{formatPct(sale.realizedRoiPercent)}</td>
                      <td className={salesStyles.numericCell}>{formatAmount(sale.walletBalanceAfterUsdt)}</td>
                      <td className={salesStyles.saleActions}>
                        <Button variant="secondary" onClick={() => setSelectedSaleId(sale.id)}>
                          Ver
                        </Button>
                        <Button variant="dangerGhost" onClick={() => setDeleteSaleTargetId(sale.id)}>
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={salesStyles.mobileSalesList} aria-label="Ventas P2P registradas en móvil">
              {pagedSales.map((sale) => (
                <article className={salesStyles.mobileSaleCard} key={sale.id}>
                  <header className={salesStyles.mobileSaleHeader}>
                    <div>
                      <h3>Venta P2P</h3>
                      <time dateTime={sale.createdAt}>{formatDate(sale.createdAt)}</time>
                    </div>
                    <Button variant="secondary" onClick={() => setSelectedSaleId(sale.id)}>
                      Ver
                    </Button>
                  </header>
                  <dl className={salesStyles.mobileSaleGrid}>
                    <div><dt>USDT vendidos</dt><dd>{formatAmount(sale.totalUsdtSold)}</dd></div>
                    <div><dt>Tasa</dt><dd>{formatAmount(sale.sellRateVes)}</dd></div>
                    <div><dt>VES recibidos</dt><dd>{formatAmount(sale.totalVesReceived)}</dd></div>
                    <div><dt>Costo FIFO</dt><dd>{formatAmount(sale.totalAllocatedCostVes)}</dd></div>
                    <div>
                      <dt>Ganancia</dt>
                      <dd className={sale.totalRealizedProfitVes < 0 ? styles.negativeValue : styles.positiveValue}>
                        {formatAmount(sale.totalRealizedProfitVes)}
                      </dd>
                    </div>
                    <div><dt>ROI</dt><dd>{formatPct(sale.realizedRoiPercent)}</dd></div>
                    <div><dt>Saldo</dt><dd>{formatAmount(sale.walletBalanceAfterUsdt)}</dd></div>
                  </dl>
                  <div className={salesStyles.mobileSaleActions}>
                    <Button variant="dangerGhost" onClick={() => setDeleteSaleTargetId(sale.id)}>
                      Eliminar venta
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {sales.length > 0 && (
          <Pagination
            page={safeSalesPage}
            totalPages={salesTotalPages}
            totalItems={sales.length}
            onPageChange={setSalesPage}
            label="Paginación de ventas"
          />
        )}
      </Card>
      )}

      {recordView === 'purchases' && (
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
      )}

      <PurchaseDetailModal
        purchaseId={selectedPurchaseId}
        onClose={() => setSelectedPurchaseId(null)}
        onRequestAccreditation={(purchaseId) => setAccreditationTargetId(purchaseId)}
      />
      <PurchaseAccreditationModal
        purchaseId={accreditationTargetId}
        onClose={() => setAccreditationTargetId(null)}
      />
      <RegisterSaleModal
        open={registerSaleOpen}
        onClose={() => setRegisterSaleOpen(false)}
      />
      <SaleDetailModal
        saleId={selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
        onRequestDelete={(saleId) => {
          setSelectedSaleId(null);
          setDeleteSaleTargetId(saleId);
        }}
      />
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Eliminar compra"
        message="¿Eliminar esta compra? No se puede eliminar una compra consumida por ventas. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
      <ConfirmDialog
        open={deleteSaleTargetId !== null}
        title="Eliminar venta P2P"
        message="¿Eliminar esta venta? Los lotes FIFO se restaurarán desde el origen y se recalculará el inventario."
        confirmLabel="Eliminar venta"
        tone="danger"
        onConfirm={handleDeleteSale}
        onCancel={() => setDeleteSaleTargetId(null)}
      />
    </section>
  );
}
