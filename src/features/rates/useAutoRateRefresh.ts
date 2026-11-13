import { useEffect, useRef, useState } from 'react';
import type { RateKey, Rates } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { fetchRateOnce } from './rateRefresh';

export const AUTO_RATE_REFRESH_DEBOUNCE_MS = 700;
export const AUTO_RATE_REFRESH_TTL_MS = 5 * 60 * 1000;

const RATE_LABELS: Record<RateKey, string> = {
  bcv: 'BCV',
  binance: 'Binance P2P',
};

export type AutoRateRefreshStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AutoRateRefreshState {
  status: AutoRateRefreshStatus;
  message: string | null;
}

const IDLE_STATE: AutoRateRefreshState = { status: 'idle', message: null };

export function getRatesNeedingAutoRefresh(
  rates: Rates,
  now = Date.now(),
): RateKey[] {
  return (Object.keys(RATE_LABELS) as RateKey[]).filter((key) => {
    const quote = rates[key];

    if (!Number.isFinite(quote.value) || quote.value <= 0) return true;
    if (quote.source !== 'auto') return false;
    if (quote.updatedAt === null) return true;

    const updatedAt = Date.parse(quote.updatedAt);
    return !Number.isFinite(updatedAt) || now - updatedAt >= AUTO_RATE_REFRESH_TTL_MS;
  });
}

export function useAutoRateRefresh(triggerKey: string | null): AutoRateRefreshState {
  const setRate = useAppStore((state) => state.setRate);
  const [state, setState] = useState<AutoRateRefreshState>(IDLE_STATE);
  const requestRef = useRef(0);

  useEffect(() => {
    setState((current) => (current.status === 'idle' ? current : IDLE_STATE));

    if (triggerKey === null) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const pendingKeys = getRatesNeedingAutoRefresh(useAppStore.getState().rates);
      if (pendingKeys.length === 0) return;

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setState({
        status: 'loading',
        message: 'Actualizando tasas automáticamente…',
      });

      const requests = pendingKeys.map((key) => fetchRateOnce(key));

      void Promise.allSettled(requests).then((results) => {
        if (cancelled || requestRef.current !== requestId) return;

        const failedKeys: RateKey[] = [];
        let updatedCount = 0;

        results.forEach((result, index) => {
          const key = pendingKeys[index];
          if (result.status === 'fulfilled') {
            const current = useAppStore.getState().rates[key];
            if (current.source === 'manual' && current.value > 0) {
              return;
            }

            setRate(key, result.value.value, 'auto');
            updatedCount += 1;
            return;
          }
          failedKeys.push(key);
        });

        if (updatedCount === 0) {
          setState({
            status: 'error',
            message:
              'No se pudieron actualizar las tasas automáticamente. Se mantienen los valores actuales.',
          });
          return;
        }

        setState({
          status: 'success',
          message:
            failedKeys.length > 0
              ? `Tasas actualizadas parcialmente. No se pudo actualizar ${failedKeys
                  .map((key) => RATE_LABELS[key])
                  .join(' y ')}.`
              : 'Tasas actualizadas automáticamente.',
        });
      });
    }, AUTO_RATE_REFRESH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [setRate, triggerKey]);

  return state;
}
