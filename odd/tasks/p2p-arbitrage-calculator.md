# Feature: P2P arbitrage calculator (USD/VES)

## Objective

Deliver a local-only React 18 + Vite + TypeScript (strict) web app that calculates and
records USD arbitrage operations in bolívares: configurable BCV/Binance P2P rates,
bank fee profiles, a pure calculation engine with a line-by-line waterfall, dual input
mode (Bs.S invested or exact USD requested), break-even rate, purchase records with
status audit trail, executed-profit closing, accounting KPIs, export/import and
light/dark theme.

## Problem / Why

The user needs a reproducible way to evaluate and track Bs.S -> USD -> Bs.S operations.
Profit simulation is error-prone by hand because fees stack in different bases and
currencies. The calculation must be a pure, tested engine so every record is
reproducible from its snapshot even after profiles/rates change.

## Scope (revised spec, authoritative)

- `zustand/persist` with mandatory `schemaVersion: 1` + `migrate` (no custom adapter).
- Styles with CSS Modules (tokens in a small global stylesheet). No heavy UI libs.
- `vite.config.ts` dev proxy to `https://p2p.binance.com` for Binance P2P.
- Rates panel (BCV + Binance P2P): manual editing, optional auto-update. Dev: Binance
  via proxy; production/fallback: `https://ve.dolarapi.com/v1/dolares` (oficial /
  paralelo). Last-update timestamp + source badge. Graceful CORS/network failures.
- Exchange gap (%) and absolute gap.
- Bank profiles CRUD: card commission + base (USD deducted / extra Bs charged),
  Binance deposit % + fixed USD, interbank toggle (default 0.30%, base initial or net),
  IGTF toggle (default 3%, base card charge or total Bs investment), slippage toggle.
- Fixed 0.50% intervention commission (not editable). No volume caps.
- Pure engine `domain/calculations.ts` with internal `round2()` applied to monetary
  stages, dual input mode, waterfall, traffic light (>3% green, >0% yellow, else red),
  negative-profit alert, break-even rate and minimum required gap.
- Purchase records: immutable snapshot (rates, fees, bases, toggles), USD bought /
  USD for Binance / USD deposited, estimated Bs out/profit/ROI, statuses
  pending -> usd_credited -> deposited_binance -> completed, cancelled from any point.
- Completion modal asks real Binance sale rate (defaults to current) and stores executed
  Bs out / executed profit / executed ROI.
- Audit log per purchase (timestamp, from, to, note), visible in detail.
- Accounting KPIs: capital in transit (pending..deposited) vs cumulative net profit
  (completed only); cancelled excluded; weighted global ROI = sum profit / sum costs.
- Records export/import JSON + CSV with `schemaVersion`; config export/import JSON.
- Zod validation for user input and import schemas.
- Editable/hideable legal disclaimer banner (disabled by default).
- Tabs: Calculadora, Perfiles, Tasas, Registros (initial: Calculadora; active section persisted in a UI localStorage key). Responsive (table -> cards on mobile).
- "Cargar datos demo": removed post-delivery at user request (button, modal, store action/helpers and demo test).
- Vitest mandatory for the engine: IEEE 754 rounding, Bs vs USD cost ROI difference,
  break-even -> exactly 0 profit, negative profit, Bs input vs USD input modes.

## Constraints

- No backend, no auth, no SSR/Next/Nuxt/Angular/Electron. 100% browser.
- Offline except optional rate auto-updates.
- Engine pure, no React imports; UI copy in Spanish; English identifiers/comments.
- Zustand for global state; Zod; CSS Modules; Vitest; no investment limits.
- Never add AI attribution to commits.

## Engine decisions (authoritative)

- `round2(value)` symmetric: round half away from zero, 2 decimals, EPSILON-corrected.
  Monetary stages are rounded to 2 decimals; rates keep input precision; break-even and
  effective rates keep full precision (display rounds).
- Input mode `bs`: `I = round2(amount)`.
  Input mode `usd`: `USD_1_target = round2(amount)`; `I_net = round2(USD_1_target * BCV)`;
  `I = round2(I_net / 0.995)`; forward pipeline recomputes `I_net`, so USD_1 may differ
  from the target by at most a cent from rounding.
- `C_int = round2(I * 0.005)`; `I_net = round2(I - C_int)`; `USD_1 = round2(I_net / BCV)`.
- Card (base `usd`): gross-up so the fee is charged over the amount that actually
  reaches Binance: `usdForBinance = round2(USD_1 / (1 + pct/100))`;
  `cardUsd = round2(USD_1 - usdForBinance)` (retained fee). Base `ves`:
  `cardBs = round2(pct% * I_net)`, charged extra in Bs; does not reduce `USD_2`;
  `cardUsd = round2(cardBs / BCV)` for display.
- `USD_2 = round2(USD_1 - cardUsd)` (usd base) or `USD_2 = USD_1` (ves base).
- Binance: `feeUsd = round2(pct% * USD_2 + fixedUsd)`; `USD_3 = round2(USD_2 - feeUsd)`.
  Engine throws if `USD_3 <= 0`.
- Interbank (optional, Bs cost): base `initial` -> `round2(pct% * I)`;
  base `net` -> `round2(pct% * I_net)`.
- IGTF (optional, Bs cost): base `card` -> `round2(pct% * cardBs)` (card charge valued in
  Bs); base `investment` -> `round2(pct% * I)`.
- Slippage: `binanceEffective = binanceRate * (1 - slippagePct/100)`.
- `bsOut = round2(USD_3 * binanceEffective)`.
- `totalCostBs = round2(I + interbankCostBs + cardBsIfVesBase + igtfCostBs)`.
- `netProfit = round2(bsOut - totalCostBs)`; `roi = netProfit / totalCostBs * 100`.
- `breakEvenRate = totalCostBs / USD_3`; `minGapPct = (breakEvenRate - BCV)/BCV * 100`.
- Traffic light: green `roi > 3`, yellow `roi > 0`, red otherwise.
- Exchange gap displays (%) and absolute gap measured against the effective BCV rate:
  `effectiveBcv = BCV + BCV * 0.005`; `gapPct = (Binance - effectiveBcv) / effectiveBcv * 100`;
  `absolute = Binance - effectiveBcv`. The minimum-gap metric (`minGapPct`) remains
  derived from the break-even rate, which already includes every cost.
- Abnormal gap warning constant: `gap >= 50%`.
- Record snapshot stores every input/fee/base/toggle for reproducibility.

## Tasks

| ID | Task | Route | Status |
| --- | --- | --- | --- |
| T0 | Scaffold revised: deps, proxy, CSS module base, shared types/utils, git init | direct inline | completed |
| T1 | Domain: engine + round2 + waterfall + break-even, Zod schemas, status machine, KPIs + Vitest | delegated worker | completed |
| T2 | Zustand store with persist/schemaVersion/migrate + export/import JSON/CSV + tests | delegated worker | completed |
| T3 | UI kit (CSS Modules) + app shell/theme + rates panel + bank profiles + settings/disclaimer | delegated worker | completed |
| T4 | Calculator panel (dual mode, reactive waterfall, break-even highlight) | delegated worker | completed |
| T5 | Records: KPIs, filters, table/cards, detail, status flow + completion modal, export/import UI, README | delegated worker | completed |
| T6 | Integration wiring, full test/build, independent verification | direct inline + verify | completed |

## Acceptance criteria

- `npm install`, `npm run dev`, `npm run build`, `npm run test` all work.
- Mandatory engine tests from the revised spec pass; validation/status/KPI tests pass.
- Calculator output matches engine; break-even recompute yields 0 profit exactly.
- Record snapshot reproduces the calculation after profile edits/deletion.
- Completion requires a real Binance rate and stores executed profit vs estimated.
- KPIs separate capital in transit (not completed/cancelled) from completed net profit;
  weighted ROI = sum executed profit / sum completed costs.
- Invalid imports rejected with clear messages and no state corruption.
- Rate auto-update failures never block nor overwrite manual values.
- Responsive layout + persisted light/dark theme + persisted schema version/migration.

## Checks

- `npm run test` (Vitest: domain, storage)
- `npm run build` (tsc --noEmit + vite build)
- Manual smoke: demo data, calculate both modes, record, advance status to completed with
  real rate, export JSON/CSV, import, theme toggle, mobile layout.

## Delivery strategy

- `exception-ok` (documented): local standalone repository with no remote/PR target; the
  user requested one complete runnable project. Work-unit commits on local `main`.
- Forecast authored lines: ~3.5k (complete app requested; no artificial splitting).

## Progress log

- Spec revised by the user (persist middleware, CSS Modules, proxy, dual engine, KPIs).
- T0 completed: scaffold committed as `d948702` (build green, 159 packages installed,
  RDD switch is off globally, so ordinary verification applies).
- T1 completed: TDD RED (4 missing suites) → GREEN (34 tests / 4 files), build verified.
  Files: calculations, validation, purchases, kpis. Parent spot-check confirmed fee
  bases, break-even precision, KPI aggregation.
- T2 completed: persist store (schemaVersion 1, migrate v0, Zod merge), demo data,
  JSON/CSV export-import (RFC4180 + validated imports). 14 new tests; full suite
  48 green. Vitest stabilized with a single fork because parallel workers crashed
  intermittently with native zone-allocation errors on Windows/Node 24.
- T3 completed: UI kit + app shell + rates auto/manual panel + profiles CRUD +
  settings/disclaimer/config exchange. Stray unused `ConfirmDialog.module.css` removed
  by the parent. Build (88 modules) and 48 tests green. `dist/` is gitignored.
- T4 completed: reactive dual-mode calculator (Bs.S invested / USD requested), profile
  fee toggles per calculation, highlighted Binance amount + break-even + min gap,
  traffic light and loss alert, responsive waterfall. Build and 48 tests green.
- T5 completed: records panel (KPIs, filters, desktop table + mobile cards), detail with
  reproducible snapshot/execution/notes, audit timeline, status flow with dedicated
  real-sale-rate closing modal, filtered JSON/CSV exchange, Spanish README.
- T6 in progress: `CalculatorPanel` + `PurchasesPanel` wired into `App.tsx`; build
  (101 modules) and 48 tests green. README integration note corrected by the parent.
  Next: independent read-only verification.
- T6 completed: full integration, live provider checks (DolarApi oficial 899,2705 /
  paralelo 1077,96531, Binance 10 ads), dev server + `/binance-api` proxy verified,
  client render smoke test added (shell + calculator + records with demo data),
  invalid `aria-valuestep` removed. Final suite 50 tests green; build green.
  The delegated independent verifier could not run (inference service overloaded), so
  parent verification (code read-through + commands + live checks) stands as evidence.
- Engram mirror pending: the memory backend currently returns "could not resolve an
  authoritative OpenCode runtime session" / degraded readiness; the local task file is
  authoritative meanwhile.
- Change request applied (post-delivery): exchange gap now uses the effective BCV rate
  (`BCV + 0.50%` intervention) as its baseline and returns `effectiveBcvRate`; rates
  panel shows the adjusted base and formula hint, calculator label clarified. Tests
  updated for the new baseline; `minGapPct` unchanged because break-even already
  includes the intervention cost.
- Tooling addition: `iniciar.bat` performs a one-click Windows start (checks Node/npm,
  installs dependencies on first run, launches Vite and opens the browser). Verified
  with `iniciar.bat --no-open`: HTTP 200 and expected page title. README updated.
- Change request applied (post-delivery): Binance P2P automatic rate now consumes the
  `SELL` side (buyer ads), which is the relevant side when selling USD/USDT for Bs.S,
  instead of `BUY`. Provider label clarifies "venta". Added `ratesApi.test.ts` asserting
  the request body uses `tradeType: 'SELL'`; live endpoint returned 10 SELL ads. Suite
  now 51 tests green.
- Change request applied (post-delivery): USD-based card commission now uses a gross-up
  (`usdForBinance = USD_1 / (1 + pct/100)`, fee = difference) instead of charging the
  percentage on `USD_1`. Canonical expected values, IGTF-card, slippage and waterfall
  tests updated; a dedicated 300 USD gross-up case added. Profile form hint documents
  the formula. Suite now 52 tests green.
- Change request applied: demo data loading removed at user request (App button/dialog, store `loadDemoData` and demo helpers, demo store test). App smoke test now asserts the empty state; suite 55 tests including the financial table/action and calculator profile-priority tests.
- Financial audit applied: intervention on Base_Bs, card inverse fee, Binance percentage on USD_2, fixed USDT P2P fee deducted at sale at the effective rate, effectiveBuyRate independent of the market P2P quote, symmetric Bs.S/USD inverse. 73 tests green; build green.
- Inverse Bs.S symmetry hardened: the entered total is anchored exactly even when cent rounding cannot represent the sum of the fee stages. 74 tests green.

## FIFO inventory extension (authoritative post-delivery spec)

### Objective

Replace the single-purchase completion flow with seven purchase states, FIFO lot
inventory in Binance, independent P2P sale records, realized profit/ROI, lot
traceability and reversible sale deletion.

### Scope

- `pending` (EN_ESPERA), `approved` (APROBADO), `usd_credited` (ACREDITADO),
  `deposited_binance` (EN_BINANCE), `partial` (EN_BINANCE_PARCIAL), `completed`
  (displayed "Completo") and `cancelled`.
- Accreditation modal creates `approved`; `usd_credited` represents bank capital and
  `deposited_binance` creates the lot with funding timestamp, initial USDT, unit cost,
  remaining USDT/cost and empty allocations.
- Pure `reconcileFifoInventory(purchases, sales)` in `domain/calculations.ts`: FIFO by
  funding timestamp, creation timestamp, id; cost anti-cent rule; fixed 0.06 USDT P2P fee
  prorated across consumed lots; exact remainder to the last lot; status transitions to
  `partial`/`completed`; wallet balance after sale.
- Sales persisted in `PersistedState.sales`; sale deletion rebuilds lots from origin.
  Consumed purchases cannot be deleted or manually completed.
- UI: stacked inventory KPIs, new inventory columns, sale capture with live FIFO preview,
  sales table/detail, purchase allocation traceability and seven-state quick actions.
- New tests: numeric three-lot example (539,935.20 VES received, 486,700 FIFO cost,
  +53,235.20 profit, 10.94% ROI, lot 3 remaining 130 / 128,050 / +11,384.45), fee
  proration, ordering, deletion restoration, insufficient balance and store guards.

### Verification evidence

- `src/domain/fifo.test.ts`: 7 tests green.
- `src/features/sales/RegisterSaleModal.test.tsx`: 2 tests green (live preview + persistence).
- Full suite: 105 tests green (`npx vitest run`).
- `npm run build`: `tsc --noEmit` + Vite build green (114 modules).
- Numeric example reproduced by the engine tests.
- Calculator input mode is persisted in `localStorage` under `calculadora-p2p:calculation-mode` and restored on mount; calculator test covers the restore/persist cycle.
- The calculator "Inversión" hero metric now exposes a one-click copy action, matching the existing Retorno and Binance copy buttons.
- The calculator enforces a minimum fixed P2P sale fee of 0.06 USDT (snapshot stores the effective fee), new profiles default to 0.06, and the purchase registration button opens a confirmation modal with the operation summary.
- The records table now shows USD/USDT as the primary amount with the Bs.S equivalent underneath; the inventory column combines remaining USDT and remaining Bs.S cost. The standalone ROI column was removed; the Utilidad column shows USD as primary and ROI as secondary. **Inversión** is the exception: total real cost in Bs.S is primary and USD bought at the bank is secondary. **Resultado** shows Bs.S obtained from sale as primary and USD as secondary; utility is blank until the purchase is `Completo`.
- Navigation moved to a sticky sidebar on desktop, collapsing to a horizontal bar on narrow screens. The records cards were renamed to **Compras** and **Ventas**, and purchase/sale table headers no longer carry currency symbols.
- The sidebar is collapsible through the accessible **Menú** button placed left of the BCV/P2P/brecha ticker; it renders as a fixed overlay with backdrop so opening it never changes content width.
- Records is split into **Compras** and **Ventas** views, each with independent pagination (10 rows per page) and its own count; purchase filters/data stay in the Compras view.
- The purchase filter block was converted into a compact single-row toolbar with inline labels, grouped date range, filter icon and a ghost clear action enabled only when filters are active.
- All numeric fields now use ATM-style entry: only digits are accepted, values shift from right to left with fixed decimals (2 by default, 4 for rates), and the display is formatted with separators. Tests cover the shift, 4-decimal rates and zero deletion.
- Final navigation revision: the sidebar/menu overlay was removed and the four section links (Calculadora, Perfiles, Tasas, Registros) are direct header tabs, preserving keyboard shortcuts and active-tab persistence.
- Added a historical P2P/BCV chart in Tasas: Binance P2P from `dolar-vzla.rafnixg.dev` and official BCV from DolarApi (both CORS-enabled), hourly 24h buckets with dashed gaps, daily open/close plus min/max band for 7d, daily averages for 30/90d, price/gap modes, break-even line, and purchase/sale pins. BCV is forward-filled up to 72h.
- Accounting KPI cards now show capital and realized profit with USD/USDT as the primary value and the Bs.S equivalent underneath; KPI tests assert the USD/USDT aggregates.
- Interbank cost now applies sequentially on `Base_Bs + 0.50% intervention`; the old initial-base option was removed from the profile form and the engine/tests were updated.
- Mobile calculator summary (Inversión, Retorno, USD Adjudicados, Monto a Ingresar en Binance, traffic light) is rendered between the amount field and the rate summary; desktop keeps it in the receipt column.


## UI polish pass (2026-11-11)

- Refreshed global design tokens: radii, spacing scale, shadows, selection/focus states and layered backgrounds; added a compact P2P brand mark in the header.
- Rebuilt the mobile header as a two-row grid (brand/theme, then horizontally scrollable direct tabs) and verified no horizontal page overflow at 320, 360, 390, 768, 1024 and 1440 px.
- Standardized interactive controls to 44 px minimum height; mobile modals now render as bottom sheets with safe-area padding and a 44 px close button.
- Tightened responsive grids: calculator hero/results stay 2 columns down to 360 px, records KPIs 2 columns down to 340 px, and bank commission tiles use 2 columns down to 360 px.
- Records toolbar uses inline filters that no longer wrap; purchase and sale views keep independent 10-row pagination.
- Added mobile sale cards with date, USDT, rate, VES received, FIFO cost, profit, ROI, balance and actions; the desktop sales table is hidden below 900 px. Verified at 390 px with seeded sale data: mobile list visible, table hidden, page width equals viewport.
- Added a mobile chart horizontal-scroll hint and 520 px chart minimum width; the 7-day smoke screenshot confirms the hint renders.
- Verification: 
px vitest run --reporter=dot -> 105/105 green; 
px tsc --noEmit -> clean; 
px vite build -> green (117 modules).

## Light-theme depth pass (2026-11-11)

- Replaced the near-white light palette with a layered surface system:
  - app background #F3F4F6;
  - cards and ticker #FFFFFF;
  - inner surfaces #F1F5F9;
  - input surfaces #F9FAFB;
  - borders #E2E8F0, strong borders #CBD5E1.
- Primary text is now #0F172A; secondary text #64748B.
- Added the prescribed soft card shadow (  4px 6px -1px rgba(15,23,42,.05), 0 2px 4px -1px rgba(15,23,42,.03)); card headers stay pure white in light mode.
- Removed the white top wash from the light background; the dark theme keeps its previous gradient and surface values through dedicated tokens.
- Calculator hero/result boxes, rate summary, records date controls, mobile record cards and mobile sale cards use the inner/summary surfaces.
- Verified at 1440px and 390px in light mode; body is gb(243,244,246), cards gb(255,255,255), inputs gb(249,250,251), inner metrics gb(241,245,249), no horizontal page overflow.
- Dark-mode check preserved gb(8,13,20) body, gb(16,25,37) cards/inputs and the previous 1px card shadow.
- Verification: 105/105 tests green and production build green.
