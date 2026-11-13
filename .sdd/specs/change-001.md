# Delta for Calculadora P2P storage and PWA

## ADDED Requirements

### Requirement: IndexedDB persistence

The system MUST persist the full Zustand state in IndexedDB under the existing logical key `calculadora-p2p` and MUST preserve the existing `PersistedState` schema and export/import format.

#### Scenario: Hydrate from IndexedDB

- GIVEN IndexedDB contains a valid persisted state
- WHEN the app starts
- THEN the store hydrates from IndexedDB before the UI renders
- AND purchases, profiles, sales, rates, disclaimer, and theme are restored

#### Scenario: First run without saved state

- GIVEN IndexedDB and localStorage contain no app state
- WHEN the app starts
- THEN the store uses defaults
- AND the app renders normally

### Requirement: Safe legacy migration

The system MUST copy existing localStorage state and rate-history cache into IndexedDB exactly once, without overwriting existing IndexedDB state.

#### Scenario: Existing localStorage state

- GIVEN localStorage contains `calculadora-p2p` and IndexedDB is empty
- WHEN the app starts after the update
- THEN the raw persisted JSON is copied to IndexedDB
- AND the rate-history cache is copied when present
- AND a migration marker is written
- AND the legacy localStorage data is retained as a backup

#### Scenario: Already migrated

- GIVEN IndexedDB already contains `calculadora-p2p`
- WHEN the app starts
- THEN the migration does not overwrite the IndexedDB state
- AND the app hydrates the existing IndexedDB state

#### Scenario: Corrupt legacy state

- GIVEN localStorage contains invalid JSON
- WHEN the migration runs
- THEN no invalid value is written to IndexedDB
- AND the app starts with defaults or the existing valid IndexedDB state
- AND the legacy value is not deleted

### Requirement: Storage fallback

The system MUST remain usable when IndexedDB is unavailable or fails to open.

#### Scenario: IndexedDB unavailable

- GIVEN IndexedDB is blocked or fails
- WHEN the app starts
- THEN storage falls back to localStorage
- AND the app remains usable
- AND Settings reports the fallback state

### Requirement: Dark launch hydration gate

The system MUST NOT render the app UI before migration and store rehydration complete.

#### Scenario: Slow hydration

- GIVEN IndexedDB hydration is pending
- WHEN the app boots
- THEN a lightweight loading state is shown
- AND no form or chart renders with default data

### Requirement: PWA shell

The system MUST provide a valid web app manifest, icons, and a service worker that precaches the app shell with an offline navigation fallback.

#### Scenario: Offline reload

- GIVEN the PWA has been loaded once and is installed or cached
- WHEN the device goes offline and the app is reopened
- THEN the app shell loads from the service worker cache

#### Scenario: Rate API requests

- GIVEN the service worker is active
- WHEN the app requests a rate or history API
- THEN the request bypasses service-worker caching
- AND the app's own rate cache remains the source of offline history

### Requirement: Install and update UX

The system SHOULD offer install guidance and MUST show a non-blocking update prompt when a new service worker is available.

#### Scenario: Android install

- GIVEN the browser fires `beforeinstallprompt`
- WHEN the user opens the install action
- THEN the native install prompt is shown

#### Scenario: iOS install

- GIVEN the app runs in iOS Safari and is not standalone
- WHEN the user opens install guidance
- THEN instructions for Share → Add to Home Screen are shown

#### Scenario: Update available

- GIVEN a new service worker is waiting
- WHEN the app detects it
- THEN a non-blocking update banner is shown
- AND the app does not reload until the user confirms

### Requirement: Data diagnostics and backup

The system SHOULD expose storage status, storage usage, persistent-storage request, and backup actions.

#### Scenario: Persistent storage granted

- GIVEN the user requests persistent storage from Settings
- WHEN the browser grants it
- THEN Settings reports persistent storage as active

#### Scenario: Backup export

- GIVEN the store is hydrated
- WHEN the user exports configuration JSON
- THEN the exported file contains the same complete `PersistedState` as before the storage migration
