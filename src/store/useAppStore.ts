import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { calculate } from '../domain/calculations';
import { calculateExecution, canTransition } from '../domain/purchases';
import type {
  BankProfile,
  BankProfileDraft,
  CalculationInput,
  DisclaimerConfig,
  PersistedState,
  PurchaseFilters,
  PurchaseRecord,
  PurchaseStatus,
  RateKey,
  RateSource,
  Rates,
  ThemeMode,
} from '../domain/types';
import {
  formatZodIssues,
  persistedStateSchema,
  purchaseRecordSchema,
} from '../domain/validation';
import { createId } from '../utils/id';
import { formatRate } from '../utils/format';

export const SCHEMA_VERSION = 1;

const DEFAULT_DISCLAIMER_TEXT =
  'Esta herramienta es únicamente una simulación y no constituye asesoría financiera ni garantiza resultados. Verifica las tasas, comisiones y condiciones antes de operar.';

const DEFAULT_FILTERS: PurchaseFilters = {
  status: 'all',
  profileName: 'all',
  dateFrom: '',
  dateTo: '',
};

export interface AppState {
  schemaVersion: number;
  rates: Rates;
  profiles: BankProfile[];
  purchases: PurchaseRecord[];
  filters: PurchaseFilters;
  disclaimer: DisclaimerConfig;
  theme: ThemeMode;

  setRate(key: RateKey, value: number, source: RateSource): void;
  setTheme(theme: ThemeMode): void;
  toggleTheme(): void;
  setDisclaimer(patch: Partial<DisclaimerConfig>): void;

  addProfile(draft: BankProfileDraft): BankProfile;
  updateProfile(id: string, draft: BankProfileDraft): void;
  deleteProfile(id: string): void;

  recordPurchase(input: CalculationInput, notes?: string): PurchaseRecord;
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

  importPurchases(records: PurchaseRecord[]): number;
  importConfig(config: PersistedState): void;
  loadDemoData(): void;
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
    disclaimer: { enabled: false, text: DEFAULT_DISCLAIMER_TEXT },
    theme: 'light',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migratePersistedState(persistedState: unknown, _version: number): PersistedState {
  const defaults = createPersistedDefaults();
  const stored = isRecord(persistedState) ? persistedState : {};
  const storedRates = isRecord(stored.rates) ? stored.rates : {};
  const storedDisclaimer = isRecord(stored.disclaimer) ? stored.disclaimer : {};
  const storedBcv = isRecord(storedRates.bcv) ? storedRates.bcv : {};
  const storedBinance = isRecord(storedRates.binance) ? storedRates.binance : {};

  const migrated = {
    ...defaults,
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    rates: {
      bcv: { ...defaults.rates.bcv, ...storedBcv },
      binance: { ...defaults.rates.binance, ...storedBinance },
    },
    disclaimer: { ...defaults.disclaimer, ...storedDisclaimer },
  };
  const parsed = persistedStateSchema.safeParse(migrated);

  return parsed.success ? parsed.data : defaults;
}

function createPurchaseRecord(
  input: CalculationInput,
  id: string,
  createdAt: string,
  notes: string,
): PurchaseRecord {
  const result = calculate(input);

  return {
    id,
    createdAt,
    profileId: result.snapshot.profileId,
    profileName: result.snapshot.profileName,
    mode: result.mode,
    inputAmount: result.inputAmount,
    amountBs: result.amountBs,
    bcvRate: result.snapshot.bcvRate,
    binanceRate: result.snapshot.binanceRate,
    snapshot: { ...result.snapshot },
    usdBought: result.usdBought,
    usdForBinance: result.usdForBinance,
    usdDeposited: result.usdDeposited,
    totalCostBs: result.totalCostBs,
    estimatedBsOut: result.bsOut,
    estimatedProfitBs: result.netProfitBs,
    estimatedRoiPct: result.roiPct,
    breakEvenRate: result.breakEvenRate,
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

function createDemoProfile(timestamp: string): BankProfile {
  return {
    id: createId(),
    name: 'Banco Demo',
    cardCommissionPct: 2,
    cardCommissionBase: 'usd',
    binanceDepositPct: 1,
    binanceDepositFixedUsd: 0.5,
    interbankEnabled: true,
    interbankPct: 0.3,
    interbankBase: 'initial',
    igtfEnabled: false,
    igtfPct: 3,
    igtfBase: 'card',
    slippageEnabled: false,
    slippagePct: 2,
    notes: 'Perfil de demostración para simular una operación; no representa condiciones bancarias reales.',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDemoPurchase(profile: BankProfile, now: Date): PurchaseRecord {
  const timeline = [
    new Date(now.getTime() - 105 * 60_000).toISOString(),
    new Date(now.getTime() - 75 * 60_000).toISOString(),
    new Date(now.getTime() - 40 * 60_000).toISOString(),
    new Date(now.getTime() - 10 * 60_000).toISOString(),
  ];
  const input: CalculationInput = {
    mode: 'bs',
    amount: 1_000,
    bcvRate: 40,
    binanceRate: 46,
    profile,
    options: {
      interbankEnabled: true,
      igtfEnabled: false,
      slippageEnabled: false,
    },
  };
  const purchase = createPurchaseRecord(input, `demo-${createId()}`, timeline[0], 'Registro de demostración — operación completada.');
  const statusHistory: PurchaseRecord['statusHistory'] = [
    {
      id: createId(),
      timestamp: timeline[0],
      fromStatus: null,
      toStatus: 'pending',
      note: 'Compra de demostración registrada',
    },
    {
      id: createId(),
      timestamp: timeline[1],
      fromStatus: 'pending',
      toStatus: 'usd_credited',
      note: 'Divisas acreditadas',
    },
    {
      id: createId(),
      timestamp: timeline[2],
      fromStatus: 'usd_credited',
      toStatus: 'deposited_binance',
      note: 'Depósito realizado en Binance',
    },
    {
      id: createId(),
      timestamp: timeline[3],
      fromStatus: 'deposited_binance',
      toStatus: 'completed',
      note: `Venta real a ${formatRate(46.5)} Bs.S/USD`,
    },
  ];
  const execution = calculateExecution(purchase, 46.5);

  return {
    ...purchase,
    status: 'completed',
    statusHistory,
    execution: { ...execution, closedAt: timeline[3] },
  };
}

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

      deleteProfile: (id) =>
        set((state) => ({ profiles: state.profiles.filter((profile) => profile.id !== id) })),

      recordPurchase: (input, notes = '') => {
        const timestamp = new Date().toISOString();
        const purchase = createPurchaseRecord(input, createId(), timestamp, notes);
        set((state) => ({ purchases: [purchase, ...state.purchases] }));
        return purchase;
      },

      changePurchaseStatus: (id, nextStatus, note = '', realBinanceRate) => {
        const purchase = get().purchases.find((record) => record.id === id);
        if (!purchase) throw new Error('Compra no encontrada');
        if (!canTransition(purchase.status, nextStatus)) {
          throw new Error('Transición de estado no permitida');
        }
        if (nextStatus === 'completed' && realBinanceRate === undefined) {
          throw new Error('La tasa real de venta es obligatoria');
        }

        const execution =
          nextStatus === 'completed'
            ? calculateExecution(purchase, realBinanceRate as number)
            : purchase.execution;
        const trimmedNote = note.trim();
        const historyNote =
          trimmedNote ||
          (nextStatus === 'completed'
            ? `Venta real a ${formatRate(realBinanceRate as number)} Bs.S/USD`
            : '');
        const historyEntry: PurchaseRecord['statusHistory'][number] = {
          id: createId(),
          timestamp: new Date().toISOString(),
          fromStatus: purchase.status,
          toStatus: nextStatus,
          note: historyNote,
        };

        set((state) => ({
          purchases: state.purchases.map((record) =>
            record.id === id
              ? {
                  ...record,
                  status: nextStatus,
                  statusHistory: [...record.statusHistory, historyEntry],
                  execution,
                }
              : record,
          ),
        }));
      },

      updatePurchaseNotes: (id, notes) =>
        set((state) => ({
          purchases: state.purchases.map((purchase) =>
            purchase.id === id ? { ...purchase, notes } : purchase,
          ),
        })),

      deletePurchase: (id) =>
        set((state) => ({ purchases: state.purchases.filter((purchase) => purchase.id !== id) })),

      setFilters: (patch) =>
        set((state) => ({ filters: { ...state.filters, ...patch } })),

      resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

      importPurchases: (records) => {
        const imported = records.map((record) => {
          const parsed = purchaseRecordSchema.safeParse(record);
          if (!parsed.success) {
            throw new Error(formatZodIssues(parsed.error).join('; '));
          }
          return parsed.data;
        });

        set((state) => {
          const purchases = [...state.purchases];
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

          return { purchases };
        });

        return imported.length;
      },

      importConfig: (config) => {
        const parsed = persistedStateSchema.safeParse(config);
        if (!parsed.success) {
          throw new Error(`La configuración importada no es válida: ${formatZodIssues(parsed.error).join('; ')}`);
        }

        set({
          schemaVersion: parsed.data.schemaVersion,
          rates: parsed.data.rates,
          profiles: parsed.data.profiles,
          purchases: parsed.data.purchases,
          disclaimer: parsed.data.disclaimer,
          theme: parsed.data.theme,
          filters: { ...DEFAULT_FILTERS },
        });
      },

      loadDemoData: () => {
        const now = new Date();
        const timestamp = now.toISOString();
        const current = get();
        const profile =
          current.profiles.find((candidate) => candidate.name === 'Banco Demo') ??
          createDemoProfile(timestamp);
        const hasDemoPurchase = current.purchases.some((purchase) => purchase.id.startsWith('demo-'));
        const demoPurchase = hasDemoPurchase ? null : createDemoPurchase(profile, now);

        set((state) => ({
          rates: {
            ...state.rates,
            bcv: { value: 40, updatedAt: timestamp, source: 'manual' },
            binance: { value: 46, updatedAt: timestamp, source: 'manual' },
          },
          profiles: state.profiles.some((candidate) => candidate.name === 'Banco Demo')
            ? state.profiles
            : [...state.profiles, profile],
          purchases: demoPurchase ? [...state.purchases, demoPurchase] : state.purchases,
        }));
      },
    }),
    {
      name: 'calculadora-p2p',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        rates: state.rates,
        profiles: state.profiles,
        purchases: state.purchases,
        disclaimer: state.disclaimer,
        theme: state.theme,
      }),
      migrate: migratePersistedState,
      merge: (persistedState, currentState) => {
        const parsed = persistedStateSchema.safeParse(persistedState);
        if (!parsed.success) return currentState;
        return { ...currentState, ...parsed.data };
      },
    },
  ),
);
