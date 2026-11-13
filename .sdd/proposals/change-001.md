# change-001: PWA and IndexedDB migration

## Status
VERIFIED (desktop browser; physical mobile install is a post-deploy gate)

## Description
Convert the local-first Calculadora P2P SPA into an installable PWA and migrate persisted application data and the 90-day rate-history cache from localStorage to IndexedDB. Preserve existing user data through an idempotent, validated migration, provide localStorage fallback when IndexedDB is unavailable, add a hydration gate before rendering, and add install/update/offline UX. Keep the data schema and JSON export/import contract unchanged. Add storage diagnostics, persistent-storage request, backup guidance, and tests for migration, fallback, async hydration, and cache migration.

## Why
The app is used on mobile and stores financially sensitive records locally. localStorage is small, synchronous, and more likely to be evicted. A PWA removes install friction and IndexedDB improves capacity and durability. The migration must be invisible and safe for existing users.

## Scope
- [x] Frontend
- [x] Storage and migration
- [x] PWA shell and service worker
- [x] Tests
- [ ] Backend (not applicable; app remains backend-free)
- [ ] Native APK (future Capacitor phase only)

## Capabilities
- `storage-persistence`: IndexedDB-backed Zustand state, async hydration, localStorage fallback, idempotent migration, rate-cache migration.
- `pwa-shell`: installable manifest, icons, service worker precache, offline app shell, API network-only policy.
- `pwa-install-update`: install prompt logic, update prompt, offline notice, standalone detection.
- `data-backup-diagnostics`: persistent-storage request, storage status/estimate, backup guidance, safe clear-data flow.

## Acceptance Criteria
- [x] Existing localStorage data is migrated to IndexedDB without user action and without data loss.
- [x] Migration is idempotent and never overwrites an existing IndexedDB state.
- [x] The app renders only after storage migration and Zustand rehydration complete.
- [x] If IndexedDB is unavailable, the app remains usable through localStorage fallback.
- [x] The 90-day rate-history cache is migrated and the chart does not re-fetch the full range after migration.
- [ ] The app is installable on Android and can be added to the iOS home screen. (Manifest and service worker verified; physical-device test pending.)
- [x] The app shell loads offline; rate APIs are not cached by the service worker.
- [x] Users receive a non-blocking update prompt and no automatic reload interrupts data entry.
- [x] Settings expose storage status, persistent-storage request, and backup/import actions.
- [x] Existing JSON export/import and schema version behavior remain compatible.
- [x] All existing tests pass, new migration/fallback tests pass, and the production build succeeds.

## Out of Scope
- Backend or cloud sync.
- Native APK/IPA packaging.
- Push notifications.
- Changing the domain data schema or financial calculations.
