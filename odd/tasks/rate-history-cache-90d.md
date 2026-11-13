# Rate history cache 90d

## Objective

Persist the historical rate samples needed to build the 24h, 7d, 30d and 90d chart, so the app fetches the API only for new data after the initial seed. Prune Binance samples older than 90 days and BCV samples older than 90 days + 3 extra days (forward-fill safety).

## Problem

`RateHistoryChart` calls `fetchRateHistory(days)` on every mount and range change. The 90d range re-downloads 90 days of Binance history and the full BCV history each time. There is no persistent cache, so switching ranges or reopening the app repeats network work.

## Scope

- Add a versioned localStorage cache separate from Zustand persisted state.
- Initial seed: 90 days of Binance, 93 days of BCV.
- Incremental updates: fetch Binance only from the latest cached sample minus a 2-day overlap; fetch BCV at most once per 12h.
- Merge, dedupe, sort, and prune on every successful update.
- Chart ranges read the same cache; changing range must not trigger a fetch.
- Keep the existing 365-day `fetchHistoricalRateForDate` behavior unchanged.

## Constraints

- User prohibits subagents: implement inline.
- Do not commit unless explicitly requested.
- Cache must not enter config export/import.
- Cache corruption must reset safely.
- Network failure with existing cache must keep the stale cache usable.
- BCV retention: 90 days + 3 days.

## Tasks

- [x] T1. Extract incremental Binance fetch and standalone BCV fetch in `src/features/rates/ratesApi.ts`.
- [x] T2. Create `src/features/rates/rateHistoryCache.ts` with model, validation, merge/dedupe, prune, TTL, seed and incremental update.
- [x] T3. Integrate `RateHistoryChart` with the cache; fetch on mount/retry only, not on range changes.
- [x] T4. Add `rateHistoryCache.test.ts`, update `RateHistoryChart.test.tsx`, and keep `ratesApi.test.ts` green.
- [x] T5. Verify `npx tsc --noEmit`, focused tests, full `npm run test`, and `npm run build`.
- [x] T6. Prune the stored cache on app startup so stale samples are removed even if the chart is not opened.

## Acceptance criteria

- First chart load seeds the cache once and renders all ranges from it.
- Subsequent loads within TTL make no API calls.
- Range switches make no API calls.
- Binance samples older than 90 local days are pruned.
- BCV samples older than 93 local days are pruned.
- Duplicate samples are removed.
- A failed incremental fetch falls back to cached data when available.
- Corrupt cache JSON is discarded and rebuilt.
- Existing 365-day purchase-date lookup still works.

## Route and delivery

- Route: direct inline (user constraint).
- Runtime context is compact; inspect only the relevant files.
- Estimated authored change: ~500-700 lines including tests. This exceeds the advisory 400-line heuristic; split into the tasks above and keep each coherent.
- No commit.

## Progress

- T1 complete: `fetchBinanceRateHistorySince` and `fetchBcvRateHistory` exported; shared `fetchBinanceHistory` filters by `since`.
- T2 complete: dedicated localStorage cache with versioning, validation, merge/dedupe, 90-day Binance retention, 93-day BCV retention, 30-minute Binance TTL, 12-hour BCV TTL, seed and incremental update.
- T3 complete: chart fetches on mount/retry only; range switches use cached samples and make no API calls.
- T4 complete: 10 cache tests, 6 chart tests, 9 rates API tests.
- T5 complete: `npm run test` = 157 passed across 21 files; `npm run build` passed.
- T6 complete: `pruneStoredRateHistoryCache()` runs from `src/main.tsx` before rendering; it loads the cache, prunes Binance >90 days and BCV >93 days, deduplicates, and saves.
- No commit.
