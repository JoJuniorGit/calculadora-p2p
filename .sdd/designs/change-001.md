# Design: PWA and IndexedDB migration

## Context

- Vite 5 + React 18 + TypeScript SPA.
- Zustand persist currently uses synchronous localStorage with `createJSONStorage`.
- Rate-history cache is a separate localStorage key, `calculadora-p2p:rate-history-cache:v1`.
- No backend, no auth, no service worker, no manifest, no `public/` directory.
- `src/main.tsx` renders synchronously and reads theme before hydration.

## Decisions

### D1. IndexedDB adapter

Use `idb-keyval` for a small key-value API over one IndexedDB database.

- Database: `calculadora-p2p`.
- Store: `keyval`.
- Keys:
  - `calculadora-p2p` — Zustand persisted JSON.
  - `calculadora-p2p:rate-history-cache:v1` — rate cache JSON.
  - `calculadora-p2p:migrated-to-idb:v1` — migration marker.
- Adapter implements Zustand `StateStorage` with async `getItem`, `setItem`, `removeItem`.
- Storage abstraction catches all IndexedDB failures and falls back to localStorage.
- App remains fully client-side.

### D2. Async hydration gate

Zustand persist will use `skipHydration: true`.

Bootstrap sequence in `src/main.tsx`:

1. Run `migrateLegacyStorage()`.
2. `await useAppStore.persist.rehydrate()`.
3. Set `document.documentElement.dataset.theme` from the hydrated state.
4. `await pruneStoredRateHistoryCache()`.
5. Render React.

If migration fails, the app still attempts hydration and renders. Settings reports fallback/migration status.

### D3. Migration algorithm

`migrateLegacyStorage()`:

1. If migration marker exists, return.
2. If IndexedDB already has `calculadora-p2p`, write marker only and return.
3. Read localStorage `calculadora-p2p`.
4. If present and JSON parses, copy raw string to IndexedDB.
5. Read localStorage rate cache and copy when present.
6. Write marker `{ migratedAt, source: 'localStorage', version: 1 }`.
7. Never delete legacy localStorage in this release.

All steps are idempotent. Existing IndexedDB state always wins. Invalid legacy JSON is ignored, never written.

### D4. Rate-history cache

Refactor `rateHistoryCache.ts` to async storage:

```ts
interface RateHistoryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

- Default storage uses IndexedDB.
- Tests inject an in-memory async storage.
- `loadRateHistoryCache`, `saveRateHistoryCache`, `pruneStoredRateHistoryCache` become async.
- Existing merge, dedupe, retention (Binance 90 days, BCV 93 days), TTL, and in-flight request dedupe remain unchanged.
- Cache migration failure is non-fatal; the cache can be rebuilt from the API.

### D5. PWA configuration

Use `vite-plugin-pwa` with `registerType: 'prompt'`.

Manifest:

- `name`: Calculadora P2P
- `short_name`: Calculadora P2P
- `start_url` and `scope` depend on the final hosting path.
- `display`: standalone
- `theme_color`: `#0f62fe`
- icons: 192, 512, maskable 512, Apple 180.

Workbox:

- Precache app shell assets.
- `navigateFallback: 'index.html'`.
- `cleanupOutdatedCaches: true`.
- `NetworkOnly` for `ve.dolarapi.com`, `dolar-vzla.rafnixg.dev`, and `/binance-api`.
- Do not cache API responses in the service worker.

### D6. Install/update/offline UX

- `UpdatePrompt` uses `virtual:pwa-register/react`; shows a banner and `updateServiceWorker(true)` on confirmation.
- `InstallPrompt` captures `beforeinstallprompt` on Android; shows iOS Share → Add to Home Screen guidance.
- Hide install UI when `display-mode: standalone`.
- `OfflineNotice` listens to online/offline events.
- Respect safe-area insets and maintain 44px touch targets.

### D7. Data diagnostics

Settings additions:

- Storage backend: IndexedDB / localStorage fallback.
- Migration status.
- `navigator.storage.estimate()` usage/quota when available.
- Request persistent storage via `navigator.storage.persist()` after user action.
- Keep existing JSON export/import as backup.
- Add a clear-local-data action only if it can be confirmed and scoped safely; otherwise defer.

## Files

New:

- `src/storage/indexedDb.ts`
- `src/storage/indexedDb.test.ts`
- `src/components/pwa/UpdatePrompt.tsx`
- `src/components/pwa/InstallPrompt.tsx`
- `src/components/pwa/OfflineNotice.tsx`
- `public/icons/*`
- `src/types/pwa.d.ts` (if required by plugin types)

Modified:

- `package.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/store/useAppStore.ts`
- `src/features/rates/rateHistoryCache.ts`
- `src/features/rates/rateHistoryCache.test.ts`
- `src/features/settings/SettingsPanel.tsx`
- `src/test/setup.ts`
- `src/App.tsx` or layout shell for PWA notices.

## Testing

Unit:

- IDB adapter read/write/delete.
- Migration fresh, existing IDB, invalid localStorage, idempotency, rate-cache copy.
- Fallback when IDB unavailable.
- Async store hydration.
- Rate-cache storage migration and async load/save.
- PWA prompt components with mocked virtual module / events.

Manual:

- Android install, standalone launch, offline reload, update prompt.
- iOS Add to Home Screen, standalone launch, offline reload.
- Existing localStorage data migration with a real backup.
- API requests are network-only.
- Export/import after migration.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Data loss during migration | Copy raw JSON, never overwrite IDB, keep localStorage backup, validate before write |
| UI renders before hydration | Async bootstrap gate; render only after rehydrate |
| IndexedDB unsupported | localStorage fallback and visible diagnostics |
| Safari eviction | Request persistent storage, IndexedDB, backup guidance |
| Stale service worker | Prompt update, cleanup outdated caches, no auto reload |
| Stale rate data | NetworkOnly API caching; app's own 90-day cache |
| Origin change loses data | Export/import before changing domains |
| Test flakiness with IDB | `fake-indexeddb` in focused tests; injectable storage |

## Rollout

1. Storage layer + migration.
2. Rate cache migration.
3. PWA shell.
4. Install/update/offline UX.
5. Diagnostics/backup.
6. Verification and deploy.
