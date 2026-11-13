import { useEffect, useRef, useState } from 'react';
import type { RateKey, Rates } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { fetchRateOnce } from './rateRefresh';
import { RateApiError, type RateApiErrorKind } from './ratesApi';

export const AUTO_RATE_REFRESH_DEBOUNCE_MS = 700;
export const AUTO_RATE_REFRESH_TTL_MS = 5 * 60 * 1000;

const RATE_LABELS: Record<RateKey, string> = {
  bcv: 'BCV',
  binance: 'Binance P2P',
};

export type AutoRateRefreshStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AutoRateRefreshFailure {
  key: RateKey;
  kind: RateApiErrorKind;
  message: string;
}

export interface AutoRateRefreshState {
  status: AutoRateRefreshStatus;
  message: string | null;
  failures: AutoRateRefreshFailure[];
}

const IDLE_STATE: AutoRateRefreshState = {
  status: 'idle',
  message: null,
  failures: [],
};

const FAILURE_REASON_LABELS: Record<RateApiErrorKind, string> = {
  timeout: 'la API tardó demasiado en responder',
  network: 'no hay conexión a internet o la API no está disponible (CORS)',
  http: 'la API respondió con un error',
  format: 'la API devolvió datos con un formato inválido',
  data: 'la API no devolvió tasas válidas',
  unknown: 'ocurrió un error inesperado al consultar la API',
};

export function describeRateFailure(failure: AutoRateRefreshFailure): string {
  return FAILURE_REASON_LABELS[failure.kind];
}

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
        failures: [],
      });

      const requests = pendingKeys.map((key) => fetchRateOnce(key));

      void Promise.allSettled(requests).then((results) => {
        if (cancelled || requestRef.current !== requestId) return;

        const failedKeys: RateKey[] = [];
        const failures: AutoRateRefreshFailure[] = [];
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
          const reason: unknown = result.reason;
          failures.push({
            key,
            kind: reason instanceof RateApiError ? reason.kind : 'unknown',
            message: reason instanceof Error ? reason.message : 'Error desconocido.',
          });
        });

        if (updatedCount === 0) {
          setState({
            status: 'error',
            message:
              'No se pudieron actualizar las tasas automáticamente. Se mantienen los valores actuales.',
            failures,
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
          failures,
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
