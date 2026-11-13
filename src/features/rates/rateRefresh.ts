import type { RateKey } from '../../domain/types';
import { fetchBcvRate, fetchBinanceRate, type FetchedRate } from './ratesApi';

const inFlight = new Map<RateKey, Promise<FetchedRate>>();

/**
 * Deduplicates concurrent rate requests for the same key. Sequential manual
 * refreshes still fetch fresh data because the entry is removed on settle.
 */
export function fetchRateOnce(key: RateKey): Promise<FetchedRate> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = key === 'bcv' ? fetchBcvRate() : fetchBinanceRate();
  inFlight.set(key, request);
  request.then(
    () => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    },
    () => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    },
  );

  return request;
}

export function clearInFlightRatesForTests(): void {
  inFlight.clear();
}
