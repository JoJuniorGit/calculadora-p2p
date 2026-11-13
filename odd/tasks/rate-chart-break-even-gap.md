# Rate chart break-even and gap overlay

## Objective

Improve the "Histórico de tasas y brecha" chart:

- Align the 7-day open and close markers on the same x coordinate.
- Replace the single horizontal break-even line with a daily break-even series.
- In gap mode, keep every price-mode series visible and add the gap on a second Y axis.

## Problem

The 7-day open and close points were offset left/right. The break-even was a flat line based on the latest purchase, not a daily series. Gap mode hid BCV, P2P, open/close, the min/max band and break-even, so the user could not compare the gap against the price information.

## Scope

- 7d markers: open and close share `plot.xFor(point)`.
- Break-even: one point per chart day, calculated by simulating the latest non-cancelled purchase with that day's BCV and the same cost structure.
- Gap mode: dual Y axis. Left axis = Bs.S prices; right axis = gap %. Show BCV, P2P, open/close, min/max band and gap. Break-even is hidden in gap mode.
- Rename the visual break-even label to "Tasa mínima" in the chart and related UI messages.
- Legend and hint updated for the combined view.
- Tests for all three behaviors.

## Constraints

- Inline implementation; user prohibits subagents.
- No commit.
- The break-even series is a simulation using the latest purchase's amount/profile snapshot, not an aggregation of all purchases.
- The break-even value itself depends on BCV and costs; P2P is the market comparison line.

## Tasks

- [x] T1. Align 7d open/close markers and add a regression test.
- [x] T2. Add `buildBreakEvenSeries` in `rateHistory.ts` using `calculate` with each day's BCV.
- [x] T3. Render the daily break-even series instead of a horizontal line.
- [x] T4. Add dual-axis gap mode: price lines on the left, gap line on the right, full legend.
- [x] T5. Update chart tests for break-even points and gap overlay.
- [x] T6. Verify tsc, focused tests, full test suite and build.
- [x] T7. Rename visual break-even to "Tasa mínima" and remove break-even from gap mode.

## Acceptance criteria

- 7d open and close markers have identical `cx`.
- One break-even point per day aligns with the day's x.
- Break-even values change with the day's BCV.
- Gap mode shows BCV, P2P, open/close, band, break-even and gap.
- Gap mode shows gap axis labels on the right.
- Gap mode does not render break-even or its legend.
- Price mode shows break-even as "Tasa mínima" in Bs.S on the left axis.
- No new API calls on mode/range switches.

## Progress

- T1 complete: open/close `cx` now both use `plot.xFor(point)`; test asserts matching `cx`.
- T2 complete: `buildBreakEvenSeries` reconstructs the purchase profile from its snapshot and calls `calculate` per day.
- T3 complete: break-even rendered as dashed segments plus warning markers.
- T4 complete: dual-axis plot refactor; `priceTicks`/`gapTicks`, `gapSegments`, `gapLine`; right axis labels use `data-axis="gap"`.
- T5 complete: chart tests cover daily break-even alignment and combined gap mode.
- T6 complete: `npm run test` = 162 passed across 21 files; `npm run build` passed.
- T7 complete: chart legend/tooltips now say `Tasa mínima`; gap mode hides the break-even series and legend. Related UI copy in the calculator and accreditation modal also uses `tasa mínima`.
- No commit.
