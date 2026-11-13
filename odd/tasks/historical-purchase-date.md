# Historical purchase date — Phase 1

## Objective

Allow registering a purchase made on a previous calendar date using the rates
that were in effect on that date, while preserving today's live-rate flow.

## Scope

- Add a date-only `purchaseDate` to new purchase records; keep `createdAt` as
  the audit timestamp.
- Resolve historical rates for that date:
  - BCV official rate for the date, with last published fallback for weekends
    and holidays.
  - Binance P2P daily median from the historical source already used by the
    chart.
  - Manual rate override when the historical lookup is unavailable or the
    user knows the executed rate.
- Use historical rates only for that calculation/snapshot; never overwrite the
  global live rates or ticker.
- Show the purchase date and rate source in the confirmation modal, records
  list/cards, and purchase detail.
- Make purchase date filters use `purchaseDate` with a legacy `createdAt`
  fallback.
- Do not backdate Binance funding in this phase. FIFO behavior for existing
  sales must remain unchanged.

## Tasks

- [ ] Extend purchase types and optional validation fields without breaking
      legacy persisted records or exports.
- [ ] Add a historical-rate lookup for a single date, including BCV
      forward-fill and P2P daily median.
- [ ] Extend the calculator with a purchase date field, historical rates,
      loading/error states, and manual overrides.
- [ ] Persist `purchaseDate` and rate-reference metadata through
      `recordPurchase`; keep the calculation snapshot immutable.
- [ ] Display purchase dates and rate source in records and detail views.
- [ ] Update purchase date filtering to prefer `purchaseDate`.
- [ ] Add tests for historical lookup, persistence, filtering, and legacy
      records.
- [ ] Run the full Vitest suite, TypeScript check, and production build.

## Acceptance criteria

- Today's purchase flow remains visually and behaviorally unchanged.
- Selecting a past date fetches and applies that day's BCV/P2P references.
- A failed or unavailable lookup does not silently use today's rates; manual
  rates can be entered.
- Saving a historical purchase stores the applied rates and source metadata.
- Live global rates are unchanged after registering a historical purchase.
- Existing records without `purchaseDate` keep working and display their
  original created date.
- FIFO ordering and realized results for existing sales are not recalculated
  by Phase 1.

## Verification

- `npx vitest run --reporter=dot`
- `npx tsc --noEmit`
- `npm run build`

## Implementation evidence (2026-11-12)

- purchaseDate and ateReference persisted as optional fields; legacy records remain valid.
- Historical lookup uses the existing dolar-vzla/DolarApi sources, P2P daily median or average fallback, BCV weekend/holiday forward-fill, and a 365-day local-calendar lookback check.
- Calculator keeps live rates untouched; historical rates are local overrides and the confirmation modal records date/source/rates.
- Records list/cards/detail display purchase date and source; date filters prefer purchaseDate.
- CSV/JSON exports preserve historical metadata; old CSV headers remain importable.
- Rate history chart pins purchases at their purchase date.
- FIFO and sale allocations were not changed; backdated funding remains Phase 2.
- Verification: 
px vitest run --reporter=dot -> 120 tests passed; 
px tsc --noEmit -> clean; 
pm run build -> green.
- Known limit: the upstream P2P source currently retains only the recent months it serves; older dates fall back to manual rates even though the app policy allows up to 365 days.
