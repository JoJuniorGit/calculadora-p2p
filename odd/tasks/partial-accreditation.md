# Feature: Partial currency accreditation and cascading recalculation

## Objective

Allow a pending purchase to confirm either a total (100%) or partial bank accreditation of USD, recalculating the executed financial flow from the immutable original request while preserving requested values and audit traceability.

## Problem

The current flow has a single set of calculated values. A partial bank approval must reduce the Bs.S actually debited, release the unused balance, and recompute card/Binance/IGTF costs, profit, ROI, break-even, and the capital-in-transit KPI without losing what was originally requested.

## Scope

- `src/domain/types.ts`: requested vs executed fields, accreditation type, audit metadata.
- `src/domain/calculations.ts`: shared downstream calculation plus `recalculateAccreditation`.
- `src/domain/validation.ts`: Zod schemas, cross-field limits, legacy normalization.
- `src/store/useAppStore.ts`: `accreditPurchase` action, record defaults, migration normalization.
- `src/domain/kpis.ts`: capital in transit consumes the executed out-of-pocket total.
- `src/storage/exportImport.ts`: JSON/CSV round-trip of the new fields with legacy CSV support.
- `src/features/purchases/PurchaseAccreditationModal.tsx` and CSS: total/partial modal with live preview, sunk-interbank toggle, audit note.
- `src/features/purchases/PurchasesPanel.tsx`: intercept pending accreditation, table/mobile partial badge.
- `src/features/purchases/PurchaseDetailModal.tsx`: requested/executed accreditation section and transition interception.
- Tests in domain, store, storage, and feature layers.

Out of scope: changing the status machine order, recalculating already-completed executions, multi-currency support, or rewriting the calculator UI.

## Constraints

- The project uses CSS Modules, not Tailwind.
- `requestedInvestmentVes` and `requestedUsd` are immutable after registration.
- The original `snapshot` remains immutable and drives the recalculation.
- Total accreditation must reproduce the original values exactly (no inverse-rounding drift).
- The interbank sunk toggle defaults to true when the original operation had interbank enabled.
- All monetary stages use `round2`.
- The current shared worktree has concurrent edits from another session; this feature runs inline as the single writer and stages only its own paths.

## Tasks

- [x] T1 - Domain model, shared calculation core, `recalculateAccreditation`, audit metadata, Zod limits and legacy normalization, domain tests.
- [x] T2 - Store `accreditPurchase`, record defaults, import/export/CSV normalization, KPI behavior, store/storage tests.
- [x] T3 - Accreditation modal, quick-action interception, table/mobile partial badge, detail modal section, UI tests, full verification.

## Acceptance criteria

- Pending purchases can register total or partial accreditation; partial requires `0 < accreditedUsd < requestedUsd` (equal is normalized to total).
- Partial recalculation uses `net = round2(accreditedUsd * snapshot.bcvRate)` and `executed = round2(net / 0.995)`.
- Refunded Bs.S equals `round2(requestedInvestmentVes - executedInvestmentVes)`.
- Interbank sunk cost stays at the original snapshot cost when the toggle is on; proportional otherwise.
- The original requested values and snapshot survive every recalculation.
- The table shows executed amounts and a `Parcial (XX%)` badge with the requested/approved/released tooltip.
- The KPI capital in transit sums the executed out-of-pocket total, not the released balance.
- The audit entry contains the exact approval percentage, approved/requested USD, and released Bs.S.
- Zod rejects `accreditedUsd <= 0` and `accreditedUsd > requestedUsd`.
- `npm run test` and `npm run build` are green.

## Verification plan

- `npx vitest run` focused domain/store/storage/UI tests during each task.
- `npm run test` and `npm run build` at closure.
- TDD: observe RED for each new behavior before implementation.

## Verification log

- Domain RED/GREEN: `src/domain/accreditation.test.ts` (4 tests) covers total reproduction, proportional partial, fixed/sunk degradation, and amount limits.
- Store/storage: `useAppStore.test.ts` (10 tests), `exportImport.test.ts` (6), `validation.test.ts` (9), and KPI tests are green.
- UI RED/GREEN: `PurchaseAccreditationModal.test.tsx` (3 tests) and `PurchasesPanel.test.tsx` (5 tests) are green.
- `npm run test`: 70/70 across 12 files.
- `npm run build`: green, 111 modules transformed.

## Commit log

- `d5d2dc3` feat(accreditation): add partial accreditation domain and store flow.
- Pending UI work-unit commit.
