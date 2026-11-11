# Feature: Records table fintech polish

## Objective

Refactor the Records table into a strict accounting-grade layout: right-aligned financial columns, tabular figures, currency moved from every row into the headers, stronger profit/ROI emphasis, a quick row action next to the kebab menu, and removal of the redundant caption.

## Problem

The current table repeats `Bs.S` and `USD` in every cell, mixes value emphasis, and offers status advancement only through the dropdown. The caption duplicates the card context and adds visual noise.

## Scope

- `src/features/purchases/PurchasesPanel.tsx`
- `src/features/purchases/PurchasesPanel.module.css`
- `src/features/purchases/PurchaseRowActions.tsx`
- `src/features/purchases/PurchaseRowActions.module.css`
- `src/utils/format.ts`
- `src/features/purchases/PurchasesPanel.test.tsx` (new)

Out of scope: domain calculations, store shape, persistence, currency formatting in other screens.

## Constraints

- The project uses CSS Modules, not Tailwind. Apply the equivalent computed styles (`text-align`, `font-variant-numeric`, `font-weight`).
- Keep `formatBs`/`formatUsd` unchanged for every other screen; add a numeric-only helper for the table.
- Keep the kebab dropdown and its behavior intact.
- Quick action must route `completed` through the detail modal (real sale rate), same as the dropdown action.

## Tasks

- [x] T1 - Add numeric-only formatter, move currencies into headers, enforce right alignment and tabular figures, strengthen Utilidad/ROI weight.
- [x] T2 - Add quick advance/liquidate icon button next to the kebab menu and remove the redundant table caption.
- [x] T3 - Add regression tests and verify with `npm run test` and `npm run build`.

## Acceptance criteria

- The five financial columns and headers are right-aligned with tabular figures.
- Table and mobile values contain no `Bs.S` or `USD` suffix; headers state the currency.
- Utilidad keeps semantic green/red and, together with ROI, uses heavier weight.
- A secondary icon button sits left of the kebab: check icon + "Liquidar operación" for `completed`, arrow + "Avanzar estado" otherwise.
- The caption "Compras que coinciden con los filtros" is gone; the table keeps an accessible name.
- Existing tests stay green and the production build succeeds.

## Route

Delegated direct is unnecessary: bounded UI refactor, files already mapped, single writer (parent) inline. Trigger evidence: 5 known files, no unknown exploration required.

## Verification log

- TDD: `npx vitest run src/features/purchases/PurchasesPanel.test.tsx` observed RED (3 failures: headers without currency, missing quick action, missing liquidation label), then GREEN (3/3).
- `npm run test`: 54/54 green across 9 files.
- `npm run build`: green, 109 modules transformed.
- Manual note: visual checks for weight/alignment rely on the existing CSS Module assertions and the production build; no browser automation was run for this slice.

## Commit log

- Pending.
