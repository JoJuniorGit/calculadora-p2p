import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { fetchRateOnce } from './rateRefresh';
import { getRatesNeedingAutoRefresh } from './useAutoRateRefresh';

/**
 * Loads missing or stale automatic rates once when the frontend boots.
 * Manual positive rates are respected by getRatesNeedingAutoRefresh.
 */
export function useInitialRates(): void {
  const setRate = useAppStore((state) => state.setRate);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    const pendingKeys = getRatesNeedingAutoRefresh(
      useAppStore.getState().rates,
    );
    if (pendingKeys.length === 0) return;

    const requests = pendingKeys.map((key) => fetchRateOnce(key));

    void Promise.allSettled(requests).then((results) => {
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;

        const key = pendingKeys[index];
        const current = useAppStore.getState().rates[key];

        // Never overwrite a manual rate entered while the request was in flight.
        if (current.source === 'manual' && current.value > 0) return;

        setRate(key, result.value.value, 'auto');
      });
    });
  }, [setRate]);
}
