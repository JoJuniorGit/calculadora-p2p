import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { PurchaseFilters, PurchaseRecord, PurchaseStatus, TableColumnKey } from '../../domain/types';
import { getNextStatuses, PURCHASE_STATUS_LABELS } from '../../domain/purchases';
import { computeKpis } from '../../domain/kpis';
import {
  clampTableColumnWidth,
  distributeTableWidths,
  resolveTableColumnWidths,
  TABLE_COLUMN_LIMITS,
  TABLE_COLUMNS,
} from '../../domain/tableColumns';
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
import { PurchaseInlineDetail } from './PurchaseInlineDetail';
import { PurchaseRowActions } from './PurchaseRowActions';
import { formatSignedPct, getPurchasePnl, type PurchasePnl } from './purchasePnl';
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

/** Page numbers around the current page: up to two behind and two ahead. */
function getPageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];

  for (let candidate = start; candidate <= end; candidate += 1) {
    pages.push(candidate);
  }

  return pages;
}

function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  label,
}: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('');

  if (totalItems === 0) return null;

  const pages = getPageWindow(page, totalPages);

  const goTo = (target: number): void => {
    const clamped = Math.min(totalPages, Math.max(1, target));
    if (clamped !== page) onPageChange(clamped);
  };

  const handleJump = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const target = Number.parseInt(jumpValue, 10);
    if (Number.isFinite(target)) goTo(target);
    setJumpValue('');
  };

  return (
    <nav className={styles.pagination} aria-label={label}>
      <div className={styles.paginationActions}>
        <Button
          variant="secondary"
          className={styles.paginationArrow}
          disabled={page <= 1}
          onClick={() => goTo(1)}
          aria-label="Primera página"
          title="Primera página"
        >
          «
        </Button>
        <Button
          variant="secondary"
          className={styles.paginationArrow}
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          aria-label="Página anterior"
          title="Página anterior"
        >
          ‹
        </Button>
        <span className={styles.paginationPages}>
          {pages.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={styles.paginationPage}
              aria-current={candidate === page ? 'page' : undefined}
              aria-label={`Página ${candidate}`}
              onClick={() => goTo(candidate)}
            >
              {candidate}
            </button>
          ))}
        </span>
        <Button
          variant="secondary"
          className={styles.paginationArrow}
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
          aria-label="Página siguiente"
          title="Página siguiente"
        >
          ›
        </Button>
        <Button
          variant="secondary"
          className={styles.paginationArrow}
          disabled={page >= totalPages}
          onClick={() => goTo(totalPages)}
          aria-label="Última página"
          title="Última página"
        >
          »
        </Button>
        <span className={styles.paginationInfo} aria-live="polite">
          Página {page} de {totalPages}
        </span>
        <form className={styles.paginationJump} onSubmit={handleJump}>
          <input
            className={styles.paginationJumpInput}
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            placeholder={`${page} / ${totalPages}`}
            aria-label={`Ir a página exacta (actual ${page} de ${totalPages})`}
          />
          <Button
            type="submit"
            variant="secondary"
            className={styles.paginationJumpButton}
          >
            Ir
          </Button>
        </form>
      </div>
    </nav>
  );
}

function renderResultCell(pnl: PurchasePnl | null): ReactNode {
  if (!pnl) return null;

  if (pnl.state === 'projected') {
    return (
      <span
        className={styles.numericStack}
        title="Resultado estimado: proyección con la tasa Binance actual. La venta aún no se ejecutó."
      >
        <span className={`${styles.primaryAmount} ${styles.projectedValue}`}>
          ~ {formatAmount(pnl.resultVes)}
        </span>
        <span className={`${styles.pnlNote} ${styles.projectedNote}`}>
          ~ {formatAmount(pnl.netUsd ?? 0)} USD netos
        </span>
      </span>
    );
  }

  if (pnl.state === 'partial') {
    return (
      <span className={styles.numericStack}>
        <span className={`${styles.primaryAmount} ${styles.realizedPartialValue}`}>
          {formatAmount(pnl.resultVes)}
        </span>
        <span className={`${styles.pnlNote} ${styles.partialNote}`}>
          Parcial ({Math.round(pnl.soldPct ?? 0)}%) · {formatSignedPct(pnl.roiPct)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={styles.numericStack}
      title="Resultado real: Bs.S efectivamente recibidos por las ventas FIFO."
    >
      <span className={`${styles.primaryAmount} ${styles.realizedValue}`}>
        {formatAmount(pnl.resultVes)}
      </span>
      <span
        className={`${styles.pnlNote} ${
          pnl.profitVes < 0 ? styles.realizedNoteNegative : styles.realizedNote
        }`}
      >
        <span aria-hidden="true">✓</span> Real · {formatSignedPct(pnl.roiPct)}
      </span>
    </span>
  );
}

function renderProfitCell(pnl: PurchasePnl | null): ReactNode {
  if (!pnl) return null;
  const tone = pnl.profitVes < 0 ? styles.negativeValue : styles.positiveValue;

  if (pnl.state === 'projected') {
    return (
      <span
        className={styles.numericStack}
        title="Ganancia estimada: proyección no ejecutada, calculada con la tasa Binance actual."
      >
        <span className={`${styles.primaryAmount} ${styles.projectedValue}`}>
          ~ {formatAmount(pnl.profitVes)}
        </span>
        <span className={`${styles.pnlNote} ${styles.projectedNote}`}>
          Est. · {formatPct(pnl.roiPct)}
        </span>
      </span>
    );
  }

  if (pnl.state === 'partial') {
    return (
      <span className={styles.numericStack}>
        <span className={`${styles.primaryAmount} ${styles.realizedPartialValue} ${styles.profitPartialValue} ${tone}`}>
          {formatAmount(pnl.profitVes)}
        </span>
        <span className={`${styles.pnlNote} ${styles.partialNote}`}>
          Parcial ({Math.round(pnl.soldPct ?? 0)}%) · {formatSignedPct(pnl.roiPct)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={styles.numericStack}
      title={
        pnl.profitVes < 0
          ? 'Pérdida realizada: resultado neto negativo confirmado por las ventas FIFO.'
          : 'Ganancia realizada: beneficio neto confirmado por las ventas FIFO.'
      }
    >
      <span className={`${styles.primaryAmount} ${styles.realizedProfit} ${tone}`}>
        {formatAmount(pnl.profitVes)}
      </span>
      <span
        className={`${styles.pnlNote} ${
          pnl.profitVes < 0 ? styles.realizedNoteNegative : styles.realizedNote
        }`}
      >
        <span aria-hidden="true">✓</span> Real · {formatSignedPct(pnl.roiPct)}
      </span>
    </span>
  );
}

interface ColumnResizerProps {
  column: TableColumnKey;
  width: number;
  /** Converts pointer pixels into stored pixels when the table stretches. */
  dragRatio: number;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
  onReset: () => void;
  /** Reports the pointer X (viewport) while dragging so the table can draw a guide. */
  onGuide: (clientX: number | null) => void;
}

function ColumnResizer({
  column,
  width,
  dragRatio,
  onPreview,
  onCommit,
  onReset,
  onGuide,
}: ColumnResizerProps) {
  const limits = TABLE_COLUMN_LIMITS[column];
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const clampWidth = (value: number): number => clampTableColumnWidth(column, value);
  const step = (delta: number): void => onCommit(clampWidth(width + delta));

  const endDrag = (): void => {
    dragRef.current = null;
    document.body.classList.remove(styles.resizingActive);
    onGuide(null);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ajustar ancho de la columna ${limits.label}`}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Arrastra o usa las flechas para ajustar el ancho; doble clic para restablecer"
      className={styles.columnResizer}
      onPointerDown={(event) => {
        event.preventDefault();
        dragRef.current = { startX: event.clientX, startWidth: width };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        document.body.classList.add(styles.resizingActive);
        onGuide(event.clientX);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        onGuide(event.clientX);
        onPreview(
          clampWidth(drag.startWidth + (event.clientX - drag.startX) * dragRatio),
        );
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        onCommit(
          clampWidth(drag.startWidth + (event.clientX - drag.startX) * dragRatio),
        );
        endDrag();
      }}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          step(-8);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          step(8);
        }
      }}
      onDoubleClick={onReset}
    />
  );
}

function getStatusInventoryNote(
  purchase: PurchaseRecord,
  inventory: ReturnType<typeof getInventoryData>,
): string | null {
  if (!inventory || inventory.remainingUsdt <= 0) return null;

  if (purchase.status === 'deposited_binance' || purchase.status === 'partial') {
    return formatUsdt(inventory.remainingUsdt);
  }
  return null;
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
  const tableColumnWidths = useAppStore((state) => state.tableColumnWidths);
  const setTableColumnWidth = useAppStore((state) => state.setTableColumnWidth);
  const currentBinanceRate = useAppStore((state) => state.rates.binance.value);

  const [previewColumnWidth, setPreviewColumnWidth] = useState<{
    column: TableColumnKey;
    width: number;
  } | null>(null);
  const [resizeGuide, setResizeGuide] = useState<number | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const resolvedColumnWidths = useMemo(
    () => resolveTableColumnWidths(tableColumnWidths),
    [tableColumnWidths],
  );

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [accreditationTargetId, setAccreditationTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [deleteSaleTargetId, setDeleteSaleTargetId] = useState<string | null>(null);
  const [registerSaleOpen, setRegisterSaleOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
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
  const [availableTableWidth, setAvailableTableWidth] = useState(0);

  useLayoutEffect(() => {
    const node = tableWrapRef.current;
    if (!node) return undefined;

    const measure = (): void => setAvailableTableWidth(node.clientWidth);
    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [recordView, filteredPurchases.length]);
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

  const columnWidth = (column: TableColumnKey): number =>
    previewColumnWidth?.column === column
      ? previewColumnWidth.width
      : resolvedColumnWidths[column];

  const renderedWidths = useMemo(() => {
    const baseWidths = { ...resolvedColumnWidths };
    if (previewColumnWidth) {
      baseWidths[previewColumnWidth.column] = previewColumnWidth.width;
    }
    return distributeTableWidths(baseWidths, availableTableWidth);
  }, [availableTableWidth, previewColumnWidth, resolvedColumnWidths]);

  // While the table stretches, pointer pixels are smaller than stored pixels:
  // dragging one column shrinks the other four' share of the spare room.
  const dragRatio = renderedWidths.fillable
    ? (TABLE_COLUMNS.length - 1) / (TABLE_COLUMNS.length - 2)
    : 1;

  const commitColumnWidth = (column: TableColumnKey, width: number): void => {
    setTableColumnWidth(column, width);
    setPreviewColumnWidth(null);
  };

  const handleResizeGuide = (clientX: number | null): void => {
    if (clientX === null) {
      setResizeGuide(null);
      return;
    }
    const rect = tableWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setResizeGuide(clientX - rect.left);
  };

  const tableWidth = renderedWidths.totalWidth;

  const renderColumnResizer = (column: TableColumnKey) => (
    <ColumnResizer
      column={column}
      width={columnWidth(column)}
      dragRatio={dragRatio}
      onPreview={(width) => setPreviewColumnWidth({ column, width })}
      onCommit={(width) => commitColumnWidth(column, width)}
      onReset={() => commitColumnWidth(column, TABLE_COLUMN_LIMITS[column].default)}
      onGuide={handleResizeGuide}
    />
  );

  const handleExport = (format: 'json' | 'csv'): void => {
    setDataNotice(null);
    try {
      const exportedIds = new Set(filteredPurchases.map((purchase) => purchase.id));
      const exportableSales = sales.filter(
        (sale) =>
          sale.allocations.length > 0 &&
          sale.allocations.every((allocation) => exportedIds.has(allocation.purchaseId)),
      );
      const content =
        format === 'json'
          ? createPurchasesJsonExport(filteredPurchases, exportableSales)
          : createPurchasesCsvExport(filteredPurchases, exportableSales);
      const mime = format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
      downloadTextFile(`compras-p2p-${getTodayStamp()}.${format}`, content, mime);
      setDataNotice({
        tone: 'success',
        message:
          exportableSales.length > 0
            ? `Se exportaron ${filteredPurchases.length} compras y ${exportableSales.length} ventas.`
            : `Se exportaron ${filteredPurchases.length} resultados filtrados.`,
      });
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

      const importedCount = importPurchases(result.data.purchases, result.data.sales);
      const importedSales = result.data.sales.length;
      setDataNotice({
        tone: 'success',
        message:
          importedSales > 0
            ? `Se importaron ${importedCount} compras y ${importedSales} ventas.`
            : `Se importaron ${importedCount} registros.`,
      });
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
          <div className={styles.recordsHeaderActions}>
            <Button variant="secondary" onClick={() => setRegisterSaleOpen(true)}>
              Registrar Venta
            </Button>
            <span className={styles.resultCount}>{filteredPurchases.length} resultados</span>
          </div>
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
            <div className={styles.tableWrap} ref={tableWrapRef}>
              <table
                className={styles.recordsTable}
                style={{ width: `${tableWidth}px` }}
                aria-label="Compras registradas"
              >
                <colgroup>
                  {TABLE_COLUMNS.map((column) => (
                    <col
                      key={column}
                      style={{ width: `${renderedWidths.widths[column]}px` }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">
                      Banco
                      {renderColumnResizer('bank')}
                    </th>
                    <th scope="col" className={styles.centerHeader}>
                      Inversión (Bs.S)
                      {renderColumnResizer('investment')}
                    </th>
                    <th scope="col" className={styles.centerHeader}>
                      Resultado (Bs.S)
                      {renderColumnResizer('outcome')}
                    </th>
                    <th scope="col" className={styles.centerHeader}>
                      Ganancia (Bs.S)
                      {renderColumnResizer('profit')}
                    </th>
                    <th scope="col" className={styles.centerHeader}>
                      Estado
                      {renderColumnResizer('status')}
                    </th>
                    <th scope="col" className={styles.actionsCell}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPurchases.map((purchase) => {
                    const pnl = getPurchasePnl(purchase, currentBinanceRate);
                    const inventory = getInventoryData(purchase);
                    const inventoryNote = getStatusInventoryNote(purchase, inventory);
                    const nextStatus = getNextStatuses(purchase.status).find((status) => status !== 'cancelled') ?? null;
                    const isExpanded = expandedPurchaseId === purchase.id;
                    return (
                      <Fragment key={purchase.id}>
                      <tr>
                        <td className={styles.bankCell}>
                          <div className={styles.bankCellLayout}>
                            <button
                              type="button"
                              className={styles.expandToggle}
                              aria-expanded={isExpanded}
                              aria-controls={`purchase-inline-${purchase.id}`}
                              aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} detalle de ${purchase.profileName}`}
                              onClick={() =>
                                setExpandedPurchaseId(isExpanded ? null : purchase.id)
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path d="M9 6l6 6-6 6" />
                              </svg>
                            </button>
                            <div className={styles.bankCellContent}>
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
                            </div>
                          </div>
                        </td>
                        <td className={`${styles.numericCell} ${styles.centerCell}`}>
                          <span className={styles.numericStack}>
                            <MoneyStack
                              primary={formatAmount(purchase.totalCostBs)}
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
                        <td
                          className={`${styles.numericCell} ${styles.centerCell}`}
                          aria-label={pnl ? undefined : 'Resultado no disponible'}
                        >
                          {renderResultCell(pnl)}
                        </td>
                        <td
                          className={`${styles.numericCell} ${styles.emphasisCell} ${styles.centerCell}`}
                          aria-label={pnl ? undefined : 'Ganancia no disponible'}
                        >
                          {renderProfitCell(pnl)}
                        </td>
                        <td className={styles.statusColumn}>
                          <div className={styles.statusCell}>
                            <StatusBadge status={purchase.status} />
                            {inventoryNote && inventory && (
                              <span
                                className={styles.statusInventory}
                                title={`Costo restante: ${formatBs(inventory.remainingCostVes)}`}
                                aria-label={`${inventoryNote}. Costo restante: ${formatBs(inventory.remainingCostVes)}`}
                              >
                                {inventoryNote}
                              </span>
                            )}
                          </div>
                        </td>
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
                      {isExpanded && (
                        <tr className={styles.detailRow} id={`purchase-inline-${purchase.id}`}>
                          <td colSpan={TABLE_COLUMNS.length}>
                            <PurchaseInlineDetail
                              purchase={purchase}
                              pnl={pnl}
                            />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {resizeGuide !== null && (
                <span
                  className={styles.resizeGuide}
                  style={{ left: `${resizeGuide}px` }}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className={styles.mobileList} aria-label="Registros de compras">
              {pagedPurchases.map((purchase) => {
                const pnl = getPurchasePnl(purchase, currentBinanceRate);
                const inventory = getInventoryData(purchase);
                const nextStatus = getNextStatuses(purchase.status).find((status) => status !== 'cancelled') ?? null;
                const isExpanded = expandedPurchaseId === purchase.id;
                const resultHint = pnl
                  ? pnl.state === 'projected'
                    ? 'Proyectado P2P'
                    : pnl.state === 'partial'
                      ? `Parcial · ${Math.round(pnl.soldPct ?? 0)}% vendido`
                      : '✓ Real'
                  : '—';
                const profitHint = pnl
                  ? pnl.state === 'projected'
                    ? `Est. · ${formatPct(pnl.roiPct)}`
                    : pnl.state === 'partial'
                      ? `Parcial · ${formatSignedPct(pnl.roiPct)}`
                      : `✓ Real · ${formatSignedPct(pnl.roiPct)}`
                  : '—';
                const resultTone = pnl
                  ? pnl.state === 'projected'
                    ? styles.mobileProjectedValue
                    : pnl.state === 'realized'
                      ? styles.mobileRealizedValue
                      : ''
                  : '';
                const profitTone = pnl
                  ? pnl.state === 'projected'
                    ? styles.mobileProjectedValue
                    : pnl.profitVes < 0
                      ? styles.negativeValue
                      : styles.positiveValue
                  : '';
                const binanceHint = inventory
                  ? pnl?.state === 'projected' && typeof pnl.netUsd === 'number'
                    ? `~ ${formatAmount(pnl.netUsd)} USD netos`
                    : (purchase.soldUsdt ?? 0) > 0
                      ? `${formatAmount(purchase.soldUsdt ?? 0)} USDT vendidos`
                      : ''
                  : '';

                return (
                  <article
                    className={styles.mobileCard}
                    key={purchase.id}
                    onClick={() => setSelectedPurchaseId(purchase.id)}
                  >
                    <header className={styles.mobileCardHeader}>
                      <div className={styles.mobileIdentity}>
                        <div className={styles.mobileBankRow}>
                          <button
                            type="button"
                            className={styles.expandToggle}
                            aria-expanded={isExpanded}
                            aria-controls={`purchase-mobile-inline-${purchase.id}`}
                            aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} detalle de ${purchase.profileName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedPurchaseId(isExpanded ? null : purchase.id);
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                          </button>
                          <h3>{purchase.profileName}</h3>
                        </div>
                        <p className={styles.mobileMeta}>
                          <time dateTime={getPurchaseDateTime(purchase)}>
                            {getPurchaseDateLabel(purchase)}
                          </time>
                          <span aria-hidden="true">·</span>
                          <span>{getPurchaseRateSourceLabel(purchase)}</span>
                        </p>
                      </div>
                      <div
                        className={styles.mobileStatusActions}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
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
                        <dt>Inversión (Bs.S)</dt>
                        <dd className={styles.mobileCell}>
                          <span className={styles.mobileCellValue}>
                            {formatAmount(purchase.totalCostBs)}
                          </span>
                          <span className={styles.mobileCellHint}>
                            {formatUsd(purchase.usdBought)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>En Binance</dt>
                        <dd className={styles.mobileCell}>
                          <span className={styles.mobileCellValue}>
                            {inventory ? `${formatAmount(inventory.remainingUsdt)} USDT` : '—'}
                          </span>
                          {binanceHint !== '' && (
                            <span className={styles.mobileCellHint}>{binanceHint}</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Resultado (Bs.S)</dt>
                        <dd className={styles.mobileCell}>
                          <span
                            className={`${styles.mobileCellValue} ${resultTone}`}
                            aria-label={pnl ? undefined : 'Resultado no disponible'}
                          >
                            {pnl
                              ? `${pnl.state === 'projected' ? '~ ' : ''}${formatAmount(pnl.resultVes)}`
                              : '—'}
                          </span>
                          <span className={styles.mobileCellHint}>{resultHint}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Ganancia (Bs.S)</dt>
                        <dd className={styles.mobileCell}>
                          <span
                            className={`${styles.mobileCellValue} ${profitTone}`}
                            aria-label={pnl ? undefined : 'Ganancia no disponible'}
                          >
                            {pnl
                              ? `${pnl.state === 'projected' ? '~ ' : ''}${formatAmount(pnl.profitVes)}`
                              : '—'}
                          </span>
                          <span className={styles.mobileCellHint}>{profitHint}</span>
                        </dd>
                      </div>
                    </dl>
                    {isExpanded && (
                      <div
                        className={styles.mobileDetail}
                        id={`purchase-mobile-inline-${purchase.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <PurchaseInlineDetail purchase={purchase} pnl={pnl} />
                      </div>
                    )}
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
            Registrar Venta
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
                      <td>
                        <div className={salesStyles.saleActions}>
                          <Button variant="secondary" onClick={() => setSelectedSaleId(sale.id)}>
                            Ver
                          </Button>
                          <Button variant="dangerGhost" onClick={() => setDeleteSaleTargetId(sale.id)}>
                            Eliminar
                          </Button>
                        </div>
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
          Las exportaciones incluyen schemaVersion y solo contienen los resultados filtrados; el JSON y el CSV incluyen también las ventas asociadas a esas compras. Para importar, usa el formato exportado por esta aplicación.
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
        onRegistered={() => setRecordView('sales')}
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
