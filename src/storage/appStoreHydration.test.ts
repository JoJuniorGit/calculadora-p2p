import 'fake-indexeddb/auto';
import { clear, createStore, set } from 'idb-keyval';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, useAppStore } from '../store/useAppStore';
import {
  APP_STATE_KEY,
  APP_STORAGE_DB,
  APP_STORAGE_STORE,
  resetIndexedDbAvailabilityForTests,
} from './indexedDb';

const store = createStore(APP_STORAGE_DB, APP_STORAGE_STORE);

const persistedState = {
  schemaVersion: SCHEMA_VERSION,
  rates: {
    bcv: { value: 52, updatedAt: null, source: 'manual' as const },
    binance: { value: 57, updatedAt: null, source: 'auto' as const },
  },
  profiles: [],
  purchases: [],
  sales: [],
  disclaimer: { text: 'Aviso de prueba', hasSeen: true },
  theme: 'dark' as const,
  tableColumnWidths: { investment: 180 },
};

beforeEach(async () => {
  localStorage.clear();
  resetIndexedDbAvailabilityForTests();
  await clear(store);
});

describe('app store hydration', () => {
  it('hydrates from IndexedDB before rendering the app', async () => {
    await set(
      APP_STATE_KEY,
      JSON.stringify({ state: persistedState, version: SCHEMA_VERSION }),
      store,
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().rates.bcv.value).toBe(52);
    expect(useAppStore.getState().disclaimer.text).toBe('Aviso de prueba');
    expect(useAppStore.getState().tableColumnWidths).toEqual({ investment: 180 });
  });

  it('falls back to legacy localStorage when IndexedDB is empty', async () => {
    localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ state: persistedState, version: SCHEMA_VERSION }),
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().rates.binance.value).toBe(57);
  });
});
