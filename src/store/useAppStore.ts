import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createAppStorage } from '../storage/indexedDb';
import {
  calculate,
  DEFAULT_P2P_FIXED_FEE_USDT,
  recalculateAccreditation,
  reconcileFifoInventory,
  round2,
} from '../domain/calculations';
import { canTransition } from '../domain/purchases';
import { clampTableColumnWidth } from '../domain/tableColumns';
import type {
  AccreditationType,
  BankProfile,
  BankProfileDraft,
  CalculationInput,
  DisclaimerConfig,
  PersistedState,
  PurchaseFilters,
  PurchaseRecordMetadata,
  PurchaseRecord,
  PurchaseStatus,
  RateKey,
  RateSource,
  Rates,
  SaleInput,
  SaleRecord,
  StatusChange,
  TableColumnKey,
  TableColumnWidths,
  ThemeMode,
} from '../domain/types';
import {
  formatZodIssues,
  normalizePurchasesPayload,
  persistedStateSchema,
  purchaseRecordSchema,
  saleRecordSchema,
  withLegacyAccreditationDefaults,
} from '../domain/validation';
import { createId } from '../utils/id';
import { formatBs, formatPct, formatUsd } from '../utils/format';

export const SCHEMA_VERSION = 1;

const DEFAULT_DISCLAIMER_TEXT =
  'Esta herramienta es únicamente una simulación y no constituye asesoría financiera ni garantiza resultados. Verifica las tasas, comisiones y condiciones antes de operar.';

const DEFAULT_FILTERS: PurchaseFilters = {
  status: 'all',
  profileName: 'all',
  dateFrom: '',
  dateTo: '',
};

export interface AccreditationRequest {
  accreditationType: AccreditationType;
  accreditedUsd: number;
  keepInterbankSunk: boolean;
  note?: string;
}

export interface AppState {
  schemaVersion: number;
  rates: Rates;
  profiles: BankProfile[];
  purchases: PurchaseRecord[];
  sales: SaleRecord[];
  filters: PurchaseFilters;
  disclaimer: DisclaimerConfig;
  theme: ThemeMode;
  tableColumnWidths: TableColumnWidths;

  setRate(key: RateKey, value: number, source: RateSource): void;
  setTheme(theme: ThemeMode): void;
  toggleTheme(): void;
  setDisclaimer(patch: Partial<DisclaimerConfig>): void;
  setTableColumnWidth(column: TableColumnKey, width: number): void;

  addProfile(draft: BankProfileDraft): BankProfile;
  updateProfile(id: string, draft: BankProfileDraft): void;
  moveProfile(activeId: string, overId: string): void;
  deleteProfile(id: string): void;

  recordPurchase(
    input: CalculationInput,
    notes?: string,
    meta?: PurchaseRecordMetadata,
  ): PurchaseRecord;
  accreditPurchase(id: string, request: AccreditationRequest): PurchaseRecord;
  registerSale(input: SaleInput): SaleRecord;
  deleteSale(id: string): void;
  changePurchaseStatus(
    id: string,
    nextStatus: PurchaseStatus,
    note?: string,
    realBinanceRate?: number,
  ): void;
  updatePurchaseNotes(id: string, notes: string): void;
  deletePurchase(id: string): void;

  setFilters(patch: Partial<PurchaseFilters>): void;
  resetFilters(): void;

  importPurchases(records: PurchaseRecord[], sales?: SaleRecord[]): number;
  importConfig(config: PersistedState): void;
}

function createPersistedDefaults(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    rates: {
      bcv: { value: 0, updatedAt: null, source: 'manual' },
      binance: { value: 0, updatedAt: null, source: 'manual' },
    },
    profiles: [],
    purchases: [],
    sales: [],
    disclaimer: { text: DEFAULT_DISCLAIMER_TEXT, hasSeen: false },
    theme: 'light',
    tableColumnWidths: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function migratePersistedState(persistedState: unknown, _version: number): PersistedState {
  const defaults = createPersistedDefaults();
  const stored = isRecord(persistedState) ? persistedState : {};
  const storedRates = isRecord(stored.rates) ? stored.rates : {};
  const storedDisclaimer = isRecord(stored.disclaimer) ? stored.disclaimer : {};
  const storedBcv = isRecord(storedRates.bcv) ? storedRates.bcv : {};
  const storedBinance = isRecord(storedRates.binance) ? storedRates.binance : {};

  const migrated = normalizePurchasesPayload({
    ...defaults,
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    rates: {
      bcv: { ...defaults.rates.bcv, ...storedBcv },
      binance: { ...defaults.rates.binance, ...storedBinance },
    },
    disclaimer: { ...defaults.disclaimer, ...storedDisclaimer },
  });
  const parsed = persistedStateSchema.safeParse(migrated);

  return parsed.success ? parsed.data : defaults;
}

function createPurchaseRecord(
  input: CalculationInput,
  id: string,
  createdAt: string,
  notes: string,
  metadata?: PurchaseRecordMetadata,
): PurchaseRecord {
  const result = calculate(input);

  return {
    id,
    createdAt,
    ...(metadata?.purchaseDate !== undefined
      ? { purchaseDate: metadata.purchaseDate }
      : {}),
    profileId: result.snapshot.profileId,
    profileName: result.snapshot.profileName,
    mode: result.mode,
    inputAmount: result.inputAmount,
    amountBs: result.amountBs,
    bcvRate: result.snapshot.bcvRate,
    binanceRate: result.snapshot.binanceRate,
    ...(metadata?.rateReference
      ? { rateReference: { ...metadata.rateReference } }
      : {}),
    snapshot: { ...result.snapshot },
    usdBought: result.usdBought,
    usdForBinance: result.usdForBinance,
    usdDeposited: result.usdDeposited,
    totalCostBs: result.totalCostBs,
    estimatedBsOut: result.bsOut,
    estimatedProfitBs: result.netProfitBs,
    estimatedRoiPct: result.roiPct,
    breakEvenRate: result.breakEvenRate,
    requestedInvestmentVes: result.amountBs,
    requestedUsd: result.usdBought,
    requestedTotalCostVes: result.amountBs,
    executedTotalCostVes: result.amountBs,
    fundedToBinanceAt: null,
    initialBinanceUsdt: 0,
    unitCostInBinanceVes: 0,
    soldUsdt: 0,
    remainingBinanceUsdt: 0,
    allocatedCostVesTotal: 0,
    remainingCostVes: 0,
    realizedRevenueVes: 0,
    realizedProfitVes: 0,
    weightedAverageSellRateVes: 0,
    allocations: [],
    accreditationType: 'TOTAL',
    accreditedUsd: result.usdBought,
    accreditationRatePercent: 100,
    executedInvestmentVes: result.amountBs,
    refundedVes: 0,
    accreditationConfirmedAt: null,
    status: 'pending',
    statusHistory: [
      {
        id: createId(),
        timestamp: createdAt,
        fromStatus: null,
        toStatus: 'pending',
        note: 'Compra registrada',
      },
    ],
    execution: null,
    notes,
  };
}

const appStorage = createAppStorage();

export const useAppStore = create<AppState>()(
  persist<AppState, [], [], PersistedState>(
    (set, get) => ({
      ...createPersistedDefaults(),
      filters: { ...DEFAULT_FILTERS },

      setRate: (key, value, source) => {
        const updatedAt = new Date().toISOString();
        set((state) => ({
          rates: {
            ...state.rates,
            [key]: { value, source, updatedAt },
          },
        }));
      },

      setTheme: (theme) => set({ theme }),

      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

      setDisclaimer: (patch) =>
        set((state) => ({ disclaimer: { ...state.disclaimer, ...patch } })),

      setTableColumnWidth: (column, width) =>
        set((state) => ({
          tableColumnWidths: {
            ...state.tableColumnWidths,
            [column]: clampTableColumnWidth(column, width),
          },
        })),

      addProfile: (draft) => {
        const timestamp = new Date().toISOString();
        const profile: BankProfile = {
          ...draft,
          id: createId(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((state) => ({ profiles: [...state.profiles, profile] }));
        return profile;
      },

      updateProfile: (id, draft) => {
        if (!get().profiles.some((profile) => profile.id === id)) return;
        const updatedAt = new Date().toISOString();
        set((state) => ({
          profiles: state.profiles.map((profile) =>
            profile.id === id ? { ...profile, ...draft, updatedAt } : profile,
          ),
        }));
      },

      moveProfile: (activeId, overId) => {
        if (activeId === overId) return;
        const { profiles } = get();
        const activeIndex = profiles.findIndex((profile) => profile.id === activeId);
        const overIndex = profiles.findIndex((profile) => profile.id === overId);
        if (activeIndex === -1 || overIndex === -1) return;
        set({ profiles: moveArrayItem(profiles, activeIndex, overIndex) });
      },

      deleteProfile: (id) =>
        set((state) => ({ profiles: state.profiles.filter((profile) => profile.id !== id) })),

      recordPurchase: (input, notes = '', metadata) => {
        const timestamp = new Date().toISOString();
        const purchase = createPurchaseRecord(
          input,
          createId(),
          timestamp,
          notes,
          metadata,
        );
        set((state) => ({ purchases: [purchase, ...state.purchases] }));
        return purchase;
      },

      accreditPurchase: (id, request) => {
        const purchase = get().purchases.find((record) => record.id === id);
        if (!purchase) throw new Error('Compra no encontrada');
        if (purchase.status !== 'pending') {
          throw new Error('Solo las compras pendientes pueden registrar una acreditación');
        }
        if (purchase.accreditationConfirmedAt !== null) {
          throw new Error('La acreditación de esta compra ya fue confirmada');
        }
        if (!canTransition(purchase.status, 'approved')) {
          throw new Error('Transición de estado no permitida');
        }

        const requestedUsd = round2(purchase.requestedUsd);
        const accreditedUsd =
          request.accreditationType === 'TOTAL'
            ? requestedUsd
            : round2(request.accreditedUsd);

        if (!Number.isFinite(accreditedUsd) || accreditedUsd <= 0) {
          throw new Error('Los USD acreditados deben ser mayores que 0');
        }
        if (accreditedUsd > requestedUsd) {
          throw new Error('Los USD acreditados no pueden superar los USD solicitados');
        }

        const preview = recalculateAccreditation(
          purchase,
          accreditedUsd,
          request.keepInterbankSunk,
        );
        const timestamp = new Date().toISOString();
        const rateLabel = formatPct(
          preview.accreditationRatePercent,
          preview.accreditationType === 'TOTAL' ? 0 : 2,
        );
        const detail =
          preview.accreditationType === 'TOTAL'
            ? `Acreditación total: aprobados ${formatUsd(preview.accreditedUsd)} de ${formatUsd(purchase.requestedUsd)} solicitados (${rateLabel}).`
            : `Acreditación parcial: aprobados ${formatUsd(preview.accreditedUsd)} de ${formatUsd(purchase.requestedUsd)} solicitados (${rateLabel}). Liberados ${formatBs(preview.refundedVes)}.`;
        const auditNote = request.note?.trim() ?? '';
        const historyEntry: StatusChange = {
          id: createId(),
          timestamp,
          fromStatus: purchase.status,
          toStatus: 'approved',
          note: auditNote ? `${detail} · ${auditNote}` : detail,
          metadata: {
            accreditationType: preview.accreditationType,
            requestedInvestmentVes: purchase.requestedInvestmentVes,
            requestedUsd: purchase.requestedUsd,
            accreditedUsd: preview.accreditedUsd,
            accreditationRatePercent: preview.accreditationRatePercent,
            executedInvestmentVes: preview.amountBs,
            refundedVes: preview.refundedVes,
            keepInterbankSunk: preview.keepInterbankSunk,
          },
        };
        const updated: PurchaseRecord = {
          ...purchase,
          amountBs: preview.amountBs,
          usdBought: preview.usdBought,
          usdForBinance: preview.usdForBinance,
          usdDeposited: preview.usdDeposited,
          totalCostBs: preview.totalCostBs,
          estimatedBsOut: preview.bsOut,
          estimatedProfitBs: preview.netProfitBs,
          estimatedRoiPct: preview.roiPct,
          breakEvenRate: preview.breakEvenRate,
          requestedTotalCostVes: purchase.requestedTotalCostVes ?? purchase.requestedInvestmentVes,
          executedTotalCostVes: preview.amountBs,
          accreditationType: preview.accreditationType,
          accreditedUsd: preview.accreditedUsd,
          accreditationRatePercent: preview.accreditationRatePercent,
          executedInvestmentVes: preview.amountBs,
          refundedVes: preview.refundedVes,
          accreditationConfirmedAt: timestamp,
          status: 'approved',
          statusHistory: [...purchase.statusHistory, historyEntry],
          execution: null,
        };

        set((state) => ({
          purchases: state.purchases.map((record) =>
            record.id === id ? updated : record,
          ),
        }));
        return updated;
      },

      changePurchaseStatus: (id, nextStatus, note = '') => {
        const purchase = get().purchases.find((record) => record.id === id);
        if (!purchase) throw new Error('Compra no encontrada');
        if (nextStatus === 'approved') {
          throw new Error('Usa el registro de acreditación para aprobar la compra');
        }
        if (nextStatus === 'completed' || nextStatus === 'partial') {
          throw new Error('El inventario se actualiza registrando ventas P2P');
        }
        if (!canTransition(purchase.status, nextStatus)) {
          throw new Error('Transición de estado no permitida');
        }

        const timestamp = new Date().toISOString();
        const trimmedNote = note.trim();
        const historyNote =
          trimmedNote ||
          (nextStatus === 'deposited_binance'
            ? 'Fondos depositados en Binance'
            : '');
        const historyEntry: PurchaseRecord['statusHistory'][number] = {
          id: createId(),
          timestamp,
          fromStatus: purchase.status,
          toStatus: nextStatus,
          note: historyNote,
        };
        const updates: Partial<PurchaseRecord> = {
          status: nextStatus,
          statusHistory: [...purchase.statusHistory, historyEntry],
        };

        if (nextStatus === 'deposited_binance') {
          const initialUsdt = round2(
            (purchase.initialBinanceUsdt ?? 0) > 0
              ? (purchase.initialBinanceUsdt as number)
              : (purchase.usdDeposited ?? 0),
          );
          const executedCost = round2(
            purchase.executedTotalCostVes ?? purchase.totalCostBs ?? purchase.amountBs,
          );
          if (initialUsdt <= 0) {
            throw new Error('La compra no tiene USDT disponibles para depositar en Binance');
          }
          updates.fundedToBinanceAt = timestamp;
          updates.initialBinanceUsdt = initialUsdt;
          updates.unitCostInBinanceVes = round2(executedCost / initialUsdt);
          updates.soldUsdt = 0;
          updates.remainingBinanceUsdt = initialUsdt;
          updates.allocatedCostVesTotal = 0;
          updates.remainingCostVes = executedCost;
          updates.realizedRevenueVes = 0;
          updates.realizedProfitVes = 0;
          updates.weightedAverageSellRateVes = 0;
          updates.allocations = [];
        }

        set((state) => ({
          purchases: state.purchases.map((record) =>
            record.id === id ? { ...record, ...updates } : record,
          ),
        }));
      },

      registerSale: (input) => {
        const latestSaleTimestamp = get().sales.reduce(
          (latest, sale) => Math.max(latest, Date.parse(sale.createdAt) || 0),
          0,
        );
        const createdAt = new Date(
          Math.max(Date.now(), latestSaleTimestamp + 1),
        ).toISOString();
        const draft: SaleRecord = {
          id: createId(),
          createdAt,
          notes: input.notes ?? '',
          totalUsdtSold: input.totalUsdtSold,
          p2pFixedFeeUsdt: input.p2pFixedFeeUsdt ?? DEFAULT_P2P_FIXED_FEE_USDT,
          netUsdtLiquidated: 0,
          sellRateVes: input.sellRateVes,
          totalVesReceived: 0,
          totalAllocatedCostVes: 0,
          totalRealizedProfitVes: 0,
          realizedRoiPercent: 0,
          walletBalanceAfterUsdt: 0,
          allocations: [],
        };

        const result = reconcileFifoInventory(get().purchases, [...get().sales, draft]);
        const sale = result.sales.find((record) => record.id === draft.id);
        if (!sale) throw new Error('No fue posible registrar la venta FIFO');

        set({ purchases: result.purchases, sales: result.sales });
        return sale;
      },

      deleteSale: (id) => {
        const sales = get().sales.filter((sale) => sale.id !== id);
        const result = reconcileFifoInventory(get().purchases, sales);
        set({ purchases: result.purchases, sales: result.sales });
      },

      updatePurchaseNotes: (id, notes) =>
        set((state) => ({
          purchases: state.purchases.map((purchase) =>
            purchase.id === id ? { ...purchase, notes } : purchase,
          ),
        })),

      deletePurchase: (id) => {
        const purchase = get().purchases.find((record) => record.id === id);
        if (!purchase) return;
        const allocations = purchase.allocations ?? [];
        const usedBySale = get().sales.some((sale) =>
          sale.allocations.some((allocation) => allocation.purchaseId === id),
        );
        if (
          usedBySale ||
          allocations.length > 0 ||
          (purchase.soldUsdt ?? 0) > 0 ||
          purchase.status === 'partial' ||
          purchase.status === 'completed'
        ) {
          throw new Error(
            'No se puede eliminar una compra consumida por ventas. Elimina primero las ventas asociadas.',
          );
        }
        set((state) => ({
          purchases: state.purchases.filter((record) => record.id !== id),
        }));
      },

      setFilters: (patch) =>
        set((state) => ({ filters: { ...state.filters, ...patch } })),

      resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

      importPurchases: (records, sales = []) => {
        const imported = records.map((record) => {
          const parsed = purchaseRecordSchema.safeParse(
            withLegacyAccreditationDefaults(record),
          );
          if (!parsed.success) {
            throw new Error(formatZodIssues(parsed.error).join('; '));
          }
          return parsed.data;
        });
        const importedSales = sales.map((sale) => {
          const parsed = saleRecordSchema.safeParse(sale);
          if (!parsed.success) {
            throw new Error(formatZodIssues(parsed.error).join('; '));
          }
          return parsed.data;
        });

        const purchases = [...get().purchases];
        const indexes = new Map(purchases.map((purchase, index) => [purchase.id, index]));

        for (const purchase of imported) {
          const existingIndex = indexes.get(purchase.id);
          if (existingIndex === undefined) {
            indexes.set(purchase.id, purchases.length);
            purchases.push(purchase);
          } else {
            purchases[existingIndex] = purchase;
          }
        }

        if (importedSales.length === 0) {
          set({ purchases });
          return imported.length;
        }

        const mergedSales = [...get().sales];
        const saleIndexes = new Map(mergedSales.map((sale, index) => [sale.id, index]));

        for (const sale of importedSales) {
          const existingIndex = saleIndexes.get(sale.id);
          if (existingIndex === undefined) {
            saleIndexes.set(sale.id, mergedSales.length);
            mergedSales.push(sale);
          } else {
            mergedSales[existingIndex] = sale;
          }
        }

        // Replay FIFO before writing so a failed import never leaves a
        // half-merged journal behind.
        const result = reconcileFifoInventory(purchases, mergedSales);
        set({ purchases: result.purchases, sales: result.sales });

        return imported.length;
      },

      importConfig: (config) => {
        const parsed = persistedStateSchema.safeParse(normalizePurchasesPayload(config));
        if (!parsed.success) {
          throw new Error(`La configuración importada no es válida: ${formatZodIssues(parsed.error).join('; ')}`);
        }

        set({
          schemaVersion: parsed.data.schemaVersion,
          rates: parsed.data.rates,
          profiles: parsed.data.profiles,
          purchases: parsed.data.purchases,
          sales: parsed.data.sales,
          disclaimer: parsed.data.disclaimer,
          theme: parsed.data.theme,
          tableColumnWidths: parsed.data.tableColumnWidths,
          filters: { ...DEFAULT_FILTERS },
        });
      },
    }),
    {
      name: 'calculadora-p2p',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => appStorage),
      skipHydration: true,
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        rates: state.rates,
        profiles: state.profiles,
        purchases: state.purchases,
        sales: state.sales,
        disclaimer: state.disclaimer,
        theme: state.theme,
        tableColumnWidths: state.tableColumnWidths,
      }),
      migrate: migratePersistedState,
      merge: (persistedState, currentState) => {
        const parsed = persistedStateSchema.safeParse(
          normalizePurchasesPayload(persistedState),
        );
        if (!parsed.success) return currentState;
        return { ...currentState, ...parsed.data };
      },
    },
  ),
);
