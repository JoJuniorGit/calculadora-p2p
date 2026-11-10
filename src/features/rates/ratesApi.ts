const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares';
const REQUEST_TIMEOUT_MS = 8_000;

export interface FetchedRate {
  value: number;
  provider: string;
}

interface RecordValue {
  [key: string]: unknown;
}

class RateApiError extends Error {}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const parsed = typeof value === 'number' ? value : Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function withTimeout<T>(
  service: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RateApiError(`La consulta a ${service} superó el límite de 8 segundos.`);
    }
    if (error instanceof RateApiError) throw error;
    throw new RateApiError(
      `No se pudo consultar ${service}. Verifica la conexión, los permisos CORS o la disponibilidad del servicio.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDolarApiRate(source: 'oficial' | 'paralelo'): Promise<FetchedRate> {
  const service = `DolarApi (${source})`;

  return withTimeout(service, async (signal) => {
    const response = await fetch(DOLAR_API_URL, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new RateApiError(`${service} respondió con el estado ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`);
    }

    const entry = payload.find(
      (candidate): candidate is RecordValue =>
        isRecord(candidate) &&
        typeof candidate.fuente === 'string' &&
        candidate.fuente.toLowerCase() === source,
    );

    if (!entry) {
      throw new RateApiError(`No se encontró la tasa ${source} en la respuesta de DolarApi.`);
    }

    const value = parsePositiveNumber(entry.promedio);
    if (value === null) {
      throw new RateApiError(`La tasa ${source} recibida de DolarApi no es válida.`);
    }

    return { value, provider: service };
  });
}

async function fetchBinanceProxyRate(): Promise<FetchedRate> {
  const service = 'Binance P2P venta (proxy local)';

  return withTimeout(service, async (signal) => {
    const response = await fetch('/binance-api/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'VES',
        merchantCheck: false,
        page: 1,
        rows: 10,
        payTypes: [],
        // The app sells USD/USDT for Bs.S, so the relevant P2P side is SELL
        // (buyer ads), not BUY (seller ads).
        tradeType: 'SELL',
      }),
      signal,
    });

    if (!response.ok) {
      throw new RateApiError(`${service} respondió con el estado ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new RateApiError(`${service} devolvió una respuesta con formato inválido.`);
    }

    const prices = payload.data.flatMap((item) => {
      if (!isRecord(item) || !isRecord(item.adv)) return [];
      const price = parsePositiveNumber(item.adv.price);
      return price === null ? [] : [price];
    });

    if (prices.length === 0) {
      throw new RateApiError(`${service} no devolvió precios válidos.`);
    }

    prices.sort((left, right) => left - right);
    const middle = Math.floor(prices.length / 2);
    const value =
      prices.length % 2 === 0
        ? (prices[middle - 1] + prices[middle]) / 2
        : prices[middle];

    if (!Number.isFinite(value) || value <= 0) {
      throw new RateApiError(`${service} no devolvió una tasa válida.`);
    }

    return { value, provider: service };
  });
}

export function fetchBcvRate(): Promise<FetchedRate> {
  return fetchDolarApiRate('oficial');
}

export async function fetchBinanceRate(): Promise<FetchedRate> {
  if (import.meta.env.DEV) {
    try {
      return await fetchBinanceProxyRate();
    } catch {
      // The CORS-enabled DolarApi source remains available when the dev proxy fails.
    }
  }

  return fetchDolarApiRate('paralelo');
}
