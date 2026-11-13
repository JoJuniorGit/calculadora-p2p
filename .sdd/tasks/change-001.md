# Tasks: PWA and IndexedDB migration

## T1. Storage layer

- [x] Add `idb-keyval`.
- [x] Create `src/storage/indexedDb.ts`.
- [x] Implement async `StateStorage` adapter with localStorage fallback.
- [x] Mirror Zustand writes to localStorage during the transition release.
- [x] Implement idempotent `migrateLegacyStorage()`.
- [x] Implement `requestPersistentStorage()` and `getStorageEstimate()`.
- [x] Add focused storage tests with `fake-indexeddb`.

## T2. Store hydration

- [x] Change `useAppStore` to `createJSONStorage(() => appStorage)`.
- [x] Set `skipHydration: true`.
- [x] Convert `src/main.tsx` to an async bootstrap.
- [x] Await migration, rehydration and rate-cache prune before rendering.
- [x] Move theme initialization after hydration.
- [x] Add a minimal boot loading screen.

## T3. Rate-history cache

- [x] Refactor `rateHistoryCache.ts` to an async storage interface.
- [x] Default to IndexedDB with localStorage fallback.
- [x] Migrate `calculadora-p2p:rate-history-cache:v1`.
- [x] Update `pruneStoredRateHistoryCache` to async.
- [x] Update cache tests to async memory storage.
- [x] Verify chart behavior and no full re-fetch after migration.

## T4. PWA base

- [x] Add `vite-plugin-pwa`.
- [x] Configure manifest, icons and Workbox.
- [x] Add `public/icons/*` and manifest meta tags.
- [x] Add `NetworkOnly` for rate APIs.
- [x] Verify service worker registration with `npm run build && npm run preview`.

## T5. PWA UX

- [x] Add update prompt using `virtual:pwa-register/react`.
- [x] Add Android install prompt and iOS guidance.
- [x] Add offline notice.
- [x] Respect safe-area insets and standalone mode.

## T6. Settings and data safety

- [x] Show storage backend, migration status and storage estimate.
- [x] Add persistent-storage request action.
- [x] Keep JSON export/import as backup.
- [ ] Add clear-local-data action only if scoped and confirmed. (Deferred: needs a dedicated destructive-flow design.)

## T7. Verification

- [x] `npx tsc --noEmit`.
- [x] Focused storage, store and rate-cache tests.
- [x] Full `npm run test` (179 passed, 25 files).
- [x] `npm run build`.
- [x] Desktop Chrome via CDP: app render, manifest link, service worker control.
- [x] Desktop Chrome via CDP: offline reload served by service worker.
- [x] Desktop Chrome via CDP: legacy localStorage state and rate cache migrated to IndexedDB with marker.
- [ ] Physical Android install/iOS Add to Home Screen. Post-deploy manual gate.
- [x] Update SDD state and archive.

## Deferred / follow-up

- Physical mobile install and update-flow validation.
- Remove the localStorage mirror after the migration release is proven.
- Consider zod 4 upgrade separately (current runtime audit reports a high-severity memory-exhaustion advisory in zod < 4.6.6).
