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
- Tabs: Tasas, Perfiles, Calculadora, Registros. Responsive (table -> cards on mobile).
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
- Change request applied: demo data loading removed at user request (App button/dialog, store `loadDemoData` and demo helpers, demo store test). App smoke test now asserts the empty state; suite 51 tests.
