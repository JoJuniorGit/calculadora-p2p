# Feature: Financial Terminal UI polish

## Objective

Refactor the existing functional app into a premium "financial terminal" UI (Stripe/Linear/Binance Pro feel) without touching business logic.

## Hard constraints

- DO NOT modify `src/domain/calculations.ts`.
- DO NOT modify any `*.test.ts` or `*.test.tsx` file.
- DO NOT change the Zustand store shape/actions in `src/store/useAppStore.ts` (visual-only changes are allowed only if unavoidable; none are expected).
- Keep the existing dark-mode palette direction, but refine surfaces, borders, elevation and typography.
- Keep CSS Modules + existing UI kit conventions. No new external UI libraries.
- Preserve the exact tab button text (`Tasas`, `Perfiles`, `Calculadora`, `Registros`) because the render smoke test matches button text exactly. Shortcut hints must be CSS pseudo-elements or attributes, not text nodes inside the tab button.
- Preserve `data-testid` attributes in the calculator receipt (`binance-amount`, `break-even-rate`, `min-gap`, `net-profit`, `traffic-light`) and the existing Spanish copy used by the smoke test (`Monto a invertir`, `La comisión por intervención es fija`, `Capital en tránsito`, `Vendido/Completado`).

## Work units

### U1 — Header/ticker/shortcuts + shared visual foundation + calculator split view
Status: completed (commit `1902496`).
- Header: persistent ticker (BCV, P2P, gap) with semantic gap color.
- Tabs: `Alt+1..4` keyboard shortcuts, subtle visual hints via CSS pseudo-elements, `aria-keyshortcuts`.
- Dark palette refinement: elevated surfaces, subtle borders, typography hierarchy, tabular numbers.
- Shared UI: Card/Button/Badge/fields polish; add `dangerGhost` button variant; `NumberField` optional inline `action`.
- New `CopyButton` with clipboard + "¡Copiado!" feedback.
- New `FilterChip` for optional cost toggles.
- Calculator: 45/55 asymmetric split; sticky receipt that never disappears (zeros + selected-bank break-even when amount is empty); hero Binance amount + Bs.S to receive with copy; pristine-only amount errors; profile summary as 3 badges; chips instead of checkboxes.
- Waterfall styling polish (table remains the receipt body).

### U2 — Records/KPIs + profiles + rates + settings
Status: completed (commit `b3523e4`).
- KPI cards: emerald glow for completed profit, blue for capital in transit, neutral for cancelled; remove visible description lines, add info-icon tooltips.
- Records table: right-aligned numeric columns with tabular nums; discreet detail button; quick "Avanzar estado" row action (for `completed`, open detail so the real sale rate modal is used); ghost delete buttons.
- Bank profiles: commission grid (3x2), compact tiles, ghost delete.
- Rates: compact refresh icon integrated into the number input; disclaimer accordion controlled by the switch; hero gap percentage with semantic color and secondary absolute/effective values.

### Integration polish (parent)
Status: completed.
- Info tooltip right-aligned so it cannot overflow the viewport; KPI Card allows overflow.
- "Avanzar estado" accent treatment; records table widened for row actions.
- Profile quick facts converted to true pills.
- Shared `ToggleField` checkbox restyled as a dark/light switch (settings + profile form).
- Profile grid uses auto-fit so a single profile uses the full row.
- Default theme remains light (dark palette refined and toggle persists); no store shape change.

## Acceptance criteria

- All 52 existing tests stay green; build succeeds.
- No domain/test/store file changed.
- Header ticker visible on every tab and updates from store rates.
- Alt+1..4 changes tabs; tab labels remain exact for the smoke test.
- Calculator receipt always visible; empty amount shows zeros and an indicative break-even for the selected profile.
- Copy buttons provide explicit feedback and handle clipboard failure.
- Numeric columns are right-aligned and use tabular figures.
- Delete actions are ghost buttons that only turn soft red on hover.
- Rates refresh is compact; disclaimer textarea disappears when the switch is off; gap percentage is the visual hero.
- Responsive at 360px; no horizontal overflow.

## Checks

- `npm run test`
- `npm run build`
- Manual smoke: all four tabs, keyboard shortcuts, calculator zero state, copy feedback, quick status advance, rates refresh, disclaimer toggle, mobile layout.

## Verification log

- `npm run test`: 52/52 green after U1, U2 and integration refinements.
- `npm run build`: green (107 modules after U1/U2).
- Headless Chrome visual smoke at 1440x2200 (light + dark): rates empty/filled, records/KPIs, calculator zero and filled, profiles, settings switch/accordion, KPI tooltip, `Alt` shortcuts, demo data.
- Functional smoke: registered a 10,000 Bs purchase, advanced it from Pendiente to Divisas acreditadas via the row quick action; the next action remained available.
- Protected files untouched: `src/domain/calculations.ts`, all `*.test.ts(x)`, `src/store/useAppStore.ts`.

## Delivery strategy

- Two sequential delegated writers (U1, U2) on local `main`, with a parent review and commit after each.
- No PRs: local standalone repo, per prior delivery decision.
