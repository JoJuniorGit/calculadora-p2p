import 'fake-indexeddb/auto';
import { createStore, del, get, set } from 'idb-keyval';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_STATE_KEY,
  APP_STORAGE_DB,
  APP_STORAGE_STORE,
  RATE_HISTORY_CACHE_KEY,
  STORAGE_MIGRATION_KEY,
  clearAppStorage,
  createAppStorage,
  migrateLegacyStorage,
  resetIndexedDbAvailabilityForTests,
  type KeyValueStore,
} from './indexedDb';

const store = createStore(APP_STORAGE_DB, APP_STORAGE_STORE);

const testIdb: KeyValueStore = {
  get: (key) => get(key, store),
  set: (key, value) => set(key, value, store),
  del: (key) => del(key, store),
};

const failingIdb: KeyValueStore = {
  get: async () => {
    throw new Error('idb unavailable');
  },
  set: async () => {
    throw new Error('idb unavailable');
  },
  del: async () => {
    throw new Error('idb unavailable');
  },
};

beforeEach(async () => {
  localStorage.clear();
  resetIndexedDbAvailabilityForTests();
  await clearAppStorage({ idb: testIdb });
});

describe('IndexedDB app storage', () => {
  it('migrates legacy state and rate cache exactly once', async () => {
    const legacyState = JSON.stringify({
      state: { schemaVersion: 1, theme: 'dark' },
      version: 1,
    });
    const legacyCache = JSON.stringify({ version: 1, binance: [], bcv: [] });
    localStorage.setItem(APP_STATE_KEY, legacyState);
    localStorage.setItem(RATE_HISTORY_CACHE_KEY, legacyCache);

    const first = await migrateLegacyStorage({
      idb: testIdb,
      local: localStorage,
    });

    expect(first.status).toBe('migrated');
    expect(first.stateMigrated).toBe(true);
    expect(first.rateCacheMigrated).toBe(true);
    expect(await get(APP_STATE_KEY, store)).toBe(legacyState);
    expect(await get(RATE_HISTORY_CACHE_KEY, store)).toBe(legacyCache);
    expect(await get(STORAGE_MIGRATION_KEY, store)).toBeTruthy();
    expect(localStorage.getItem(APP_STATE_KEY)).toBe(legacyState);

    const second = await migrateLegacyStorage({
      idb: testIdb,
      local: localStorage,
    });
    expect(second.status).toBe('already-migrated');
  });

  it('never overwrites an existing IndexedDB state', async () => {
    const existing = JSON.stringify({
      state: { schemaVersion: 1, theme: 'light' },
      version: 1,
    });
    const legacy = JSON.stringify({
      state: { schemaVersion: 1, theme: 'dark' },
      version: 1,
    });
    await set(APP_STATE_KEY, existing, store);
    localStorage.setItem(APP_STATE_KEY, legacy);

    const result = await migrateLegacyStorage({
      idb: testIdb,
      local: localStorage,
    });

    expect(result.status).toBe('already-migrated');
    expect(await get(APP_STATE_KEY, store)).toBe(existing);
  });

  it('copies a missing rate cache when state already exists in IndexedDB', async () => {
    const existing = JSON.stringify({ state: { theme: 'light' }, version: 1 });
    const legacyCache = JSON.stringify({ version: 1, binance: [], bcv: [] });
    await set(APP_STATE_KEY, existing, store);
    localStorage.setItem(RATE_HISTORY_CACHE_KEY, legacyCache);

    const result = await migrateLegacyStorage({
      idb: testIdb,
      local: localStorage,
    });

    expect(result.status).toBe('already-migrated');
    expect(result.rateCacheMigrated).toBe(true);
    expect(await get(RATE_HISTORY_CACHE_KEY, store)).toBe(legacyCache);
  });

  it('ignores invalid legacy JSON', async () => {
    localStorage.setItem(APP_STATE_KEY, '{invalid');

    const result = await migrateLegacyStorage({
      idb: testIdb,
      local: localStorage,
    });

    expect(result.status).toBe('no-legacy-data');
    expect(await get(APP_STATE_KEY, store)).toBeUndefined();
    expect(localStorage.getItem(APP_STATE_KEY)).toBe('{invalid');
  });

  it('writes IndexedDB and mirrors to localStorage during the transition', async () => {
    const storage = createAppStorage({
      idb: testIdb,
      local: localStorage,
      mirrorToLocalStorage: true,
    });

    await storage.setItem('probe', 'indexed-value');

    expect(await storage.getItem('probe')).toBe('indexed-value');
    expect(await get('probe', store)).toBe('indexed-value');
    expect(localStorage.getItem('probe')).toBe('indexed-value');
  });

  it('falls back to localStorage when IndexedDB fails', async () => {
    const storage = createAppStorage({
      idb: failingIdb,
      local: localStorage,
      mirrorToLocalStorage: true,
    });
    localStorage.setItem('legacy', 'stored');

    expect(await storage.getItem('legacy')).toBe('stored');

    await storage.setItem('new-value', 'saved');
    expect(localStorage.getItem('new-value')).toBe('saved');
  });

  it('clears both IndexedDB and localStorage', async () => {
    await set(APP_STATE_KEY, 'state', store);
    localStorage.setItem(APP_STATE_KEY, 'state');

    await clearAppStorage({ idb: testIdb });

    expect(await get(APP_STATE_KEY, store)).toBeUndefined();
    expect(localStorage.getItem(APP_STATE_KEY)).toBeNull();
  });
});
