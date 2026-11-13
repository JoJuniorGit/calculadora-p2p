import { clear, createStore, del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

export const APP_STORAGE_DB = 'calculadora-p2p';
export const APP_STORAGE_STORE = 'keyval';
export const APP_STATE_KEY = 'calculadora-p2p';
export const RATE_HISTORY_CACHE_KEY = 'calculadora-p2p:rate-history-cache:v1';
export const STORAGE_MIGRATION_KEY = 'calculadora-p2p:migrated-to-idb:v1';

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const defaultStore = createStore(APP_STORAGE_DB, APP_STORAGE_STORE);

const defaultIdb: KeyValueStore = {
  get: (key) => get(key, defaultStore),
  set: (key, value) => set(key, value, defaultStore),
  del: (key) => del(key, defaultStore),
};

let availabilityPromise: Promise<boolean> | null = null;

function resolveLocalStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function probeStore(idb: KeyValueStore): Promise<boolean> {
  return (async () => {
    try {
      const probeKey = `__calculadora_p2p_probe_${Date.now()}__`;
      await idb.set(probeKey, '1');
      await idb.del(probeKey);
      return true;
    } catch {
      return false;
    }
  })();
}

export function isIndexedDbAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  if (!availabilityPromise) availabilityPromise = probeStore(defaultIdb);
  return availabilityPromise;
}

export function resetIndexedDbAvailabilityForTests(): void {
  availabilityPromise = null;
}

export interface AppStorageOptions {
  idb?: KeyValueStore;
  local?: Storage | null;
  mirrorToLocalStorage?: boolean;
}

/**
 * Async Zustand storage backed by IndexedDB.
 *
 * During the migration release, successful writes are also mirrored to
 * localStorage as a best-effort recovery copy. IndexedDB remains the primary
 * read source. Remove the mirror in a later release after migration is proven.
 */
export function createAppStorage(options: AppStorageOptions = {}): StateStorage {
  const idb = options.idb ?? defaultIdb;
  const local = options.local === undefined ? resolveLocalStorage() : options.local;
  const mirror = options.mirrorToLocalStorage ?? true;
  let available: Promise<boolean> | null = null;

  const canUseIdb = (): Promise<boolean> => {
    if (!available) available = probeStore(idb);
    return available;
  };

  return {
    getItem: async (name) => {
      if (await canUseIdb()) {
        try {
          const value = await idb.get(name);
          if (typeof value === 'string') return value;
          if (value !== undefined && value !== null) return JSON.stringify(value);
        } catch {
          // Fall through to localStorage.
        }
      }

      return local?.getItem(name) ?? null;
    },

    setItem: (name, value) => {
      if (mirror && local) {
        try {
          local.setItem(name, value);
        } catch {
          // The backup copy is best-effort.
        }
      }

      return (async () => {
        if (await canUseIdb()) {
          try {
            await idb.set(name, value);
            return;
          } catch {
            // Fall through to localStorage.
          }
        }

        if (!mirror && local) {
          try {
            local.setItem(name, value);
          } catch {
            // Ignore quota/private-mode failures.
          }
        }
      })();
    },

    removeItem: (name) => {
      if (local) {
        try {
          local.removeItem(name);
        } catch {
          // Ignore cleanup failures.
        }
      }

      return (async () => {
        if (await canUseIdb()) {
          try {
            await idb.del(name);
          } catch {
            // Ignore cleanup failures.
          }
        }
      })();
    },
  };
}

export function createAsyncKeyValueStorage(
  options: AppStorageOptions = {},
): AsyncKeyValueStorage {
  const storage = createAppStorage(options);

  return {
    getItem: async (key) => await storage.getItem(key),
    setItem: async (key, value) => {
      await storage.setItem(key, value);
    },
    removeItem: async (key) => {
      await storage.removeItem(key);
    },
  };
}

export type StorageMigrationStatus =
  | 'migrated'
  | 'already-migrated'
  | 'no-legacy-data'
  | 'unavailable'
  | 'failed';

export interface StorageMigrationResult {
  status: StorageMigrationStatus;
  stateMigrated: boolean;
  rateCacheMigrated: boolean;
  error?: string;
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface StorageMigrationInfo {
  migratedAt: string;
  source: string;
  version: number;
}

export async function getStorageMigrationInfo(): Promise<StorageMigrationInfo | null> {
  try {
    const marker = await defaultIdb.get(STORAGE_MIGRATION_KEY);
    if (!isRecord(marker)) return null;

    return {
      migratedAt:
        typeof marker.migratedAt === 'string' ? marker.migratedAt : '',
      source: typeof marker.source === 'string' ? marker.source : 'unknown',
      version: typeof marker.version === 'number' ? marker.version : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Copy legacy localStorage data into IndexedDB exactly once.
 *
 * Safety rules:
 * - Existing IndexedDB state always wins.
 * - Invalid JSON is never written.
 * - Legacy localStorage is never deleted here.
 * - A failed copy leaves the migration marker unwritten so it can retry.
 */
export async function migrateLegacyStorage(
  options: AppStorageOptions = {},
): Promise<StorageMigrationResult> {
  const idb = options.idb ?? defaultIdb;
  const local = options.local === undefined ? resolveLocalStorage() : options.local;

  if (!local) {
    return {
      status: 'unavailable',
      stateMigrated: false,
      rateCacheMigrated: false,
    };
  }

  try {
    const marker = await idb.get(STORAGE_MIGRATION_KEY);
    if (marker !== undefined && marker !== null) {
      return {
        status: 'already-migrated',
        stateMigrated: false,
        rateCacheMigrated: false,
      };
    }

    const existingState = await idb.get(APP_STATE_KEY);
    if (existingState !== undefined && existingState !== null) {
      const existingRateCache = await idb.get(RATE_HISTORY_CACHE_KEY);
      let rateCacheMigrated = false;

      if (existingRateCache === undefined || existingRateCache === null) {
        const legacyRateCache = local.getItem(RATE_HISTORY_CACHE_KEY);
        if (legacyRateCache && isValidJson(legacyRateCache)) {
          await idb.set(RATE_HISTORY_CACHE_KEY, legacyRateCache);
          rateCacheMigrated = true;
        }
      }

      await idb.set(STORAGE_MIGRATION_KEY, {
        migratedAt: new Date().toISOString(),
        source: 'existing-indexeddb',
        version: 1,
      });
      return {
        status: 'already-migrated',
        stateMigrated: false,
        rateCacheMigrated,
      };
    }

    const legacyState = local.getItem(APP_STATE_KEY);
    let stateMigrated = false;
    if (legacyState && isValidJson(legacyState)) {
      await idb.set(APP_STATE_KEY, legacyState);
      stateMigrated = true;
    }

    const legacyRateCache = local.getItem(RATE_HISTORY_CACHE_KEY);
    let rateCacheMigrated = false;
    if (legacyRateCache && isValidJson(legacyRateCache)) {
      await idb.set(RATE_HISTORY_CACHE_KEY, legacyRateCache);
      rateCacheMigrated = true;
    }

    await idb.set(STORAGE_MIGRATION_KEY, {
      migratedAt: new Date().toISOString(),
      source: stateMigrated || rateCacheMigrated ? 'localStorage' : 'none',
      version: 1,
    });

    return {
      status:
        stateMigrated || rateCacheMigrated ? 'migrated' : 'no-legacy-data',
      stateMigrated,
      rateCacheMigrated,
    };
  } catch (error) {
    return {
      status: 'failed',
      stateMigrated: false,
      rateCacheMigrated: false,
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo migrar el almacenamiento local.',
    };
  }
}

export async function requestPersistentStorage(): Promise<
  'granted' | 'denied' | 'unsupported'
> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.persist !== 'function'
  ) {
    return 'unsupported';
  }

  try {
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.persisted !== 'function'
  ) {
    return false;
  }

  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  } catch {
    return null;
  }
}

export async function clearAppStorage(
  options: AppStorageOptions = {},
): Promise<void> {
  const idb = options.idb ?? defaultIdb;
  const local = options.local === undefined ? resolveLocalStorage() : options.local;

  if (local) {
    try {
      local.removeItem(APP_STATE_KEY);
      local.removeItem(RATE_HISTORY_CACHE_KEY);
      local.removeItem(STORAGE_MIGRATION_KEY);
    } catch {
      // Ignore cleanup failures.
    }
  }

  try {
    if (options.idb) {
      await idb.del(APP_STATE_KEY);
      await idb.del(RATE_HISTORY_CACHE_KEY);
      await idb.del(STORAGE_MIGRATION_KEY);
    } else {
      await clear(defaultStore);
    }
  } catch {
    // Ignore cleanup failures.
  }
}
