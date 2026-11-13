import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBinanceRate,
  fetchBinanceRateHistorySince,
  fetchHistoricalRateForDate,
  fetchRateHistory,
  HistoricalRateLookupError,
} from './ratesApi';

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function failedResponse(status = 500): Response {
  return {
    ok: false,
    status,
    json: async () => null,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchBinanceRate', () => {
  it('requests the SELL side of the P2P book through the dev proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { adv: { price: '100.00' } },
          { adv: { price: '100.00' } },
          { adv: { price: '102.00' } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const rate = await fetchBinanceRate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/binance-api/bapi/c2c/v2/friendly/c2c/adv/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      asset: 'USDT',
      fiat: 'VES',
      tradeType: 'SELL',
    });
    expect(rate.value).toBe(100);
    expect(rate.provider).toContain('Binance');
    expect(rate.provider.toLowerCase()).not.toContain('proxy');
  });

  it('falls back to CriptoYa when the dev proxy fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/binance-api/')) {
        return Promise.resolve(failedResponse(503));
      }
      return Promise.resolve(jsonResponse({ ask: 1040, totalAsk: 1040, bid: 1048, totalBid: 1048 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const rate = await fetchBinanceRate();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('criptoya.com');
    expect(rate.value).toBe(1048);
    expect(rate.provider).toContain('CriptoYa');
  });

  it('falls back to DolarApi paralelo when CriptoYa fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/binance-api/') || url.includes('criptoya.com')) {
        return Promise.resolve(failedResponse(500));
      }
      return Promise.resolve(
        jsonResponse([
          { fuente: 'oficial', promedio: 911.5 },
          { fuente: 'paralelo', promedio: 1041.4 },
        ]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const rate = await fetchBinanceRate();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain('ve.dolarapi.com');
    expect(rate.value).toBe(1041.4);
    expect(rate.provider).toContain('DolarApi');
  });

  it('falls back to Yadio when every P2P provider fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('yadio.io')) {
        return Promise.resolve(jsonResponse({ USD: { VES: 1041.25 } }));
      }
      return Promise.resolve(failedResponse(500));
    });
    vi.stubGlobal('fetch', fetchMock);

    const rate = await fetchBinanceRate();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(rate.value).toBe(1041.25);
    expect(rate.provider).toContain('Yadio');
  });

  it('throws when every binance provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failedResponse(500)));

    await expect(fetchBinanceRate()).rejects.toThrow(
      /ninguna de las APIs de respaldo/,
    );
  });

  it('uses the same-origin proxy instead of the Binance dev proxy outside development', async () => {
    vi.stubEnv('DEV', false);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/binance-rate') {
        return Promise.resolve(jsonResponse({ value: 1046.9, provider: 'Binance P2P' }));
      }
      return Promise.resolve(failedResponse(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    const rate = await fetchBinanceRate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/binance-rate');
    expect(rate.value).toBe(1046.9);
    expect(rate.provider).toContain('Binance');
  });

  it('falls back to CriptoYa when the production proxy fails', async () => {
    vi.stubEnv('DEV', false);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/binance-rate') {
        return Promise.resolve(failedResponse(502));
      }
      return Promise.resolve(jsonResponse({ ask: 1040, bid: 1048 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const rate = await fetchBinanceRate();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('criptoya.com');
    expect(rate.value).toBe(1048);
    expect(rate.provider).toContain('CriptoYa');
  });

  it('parses the CORS-enabled P2P history and official BCV history', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/history/binance')) {
        return Promise.resolve(
          jsonResponse({
            currencies: [
              {
                date: '2026-11-11T08:00:00Z',
                median_price: 1079.999,
                average_price: 1082.337857,
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse([
          {
            fecha: '2026-11-11',
            promedio: 901.6175,
          },
        ]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const history = await fetchRateHistory(7);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/history/binance'))).toBe(true);
    expect(urls.some((url) => url.includes('ve.dolarapi.com'))).toBe(true);
    expect(urls.find((url) => url.includes('/history/binance'))).toContain(
      'fiat=VES',
    );
    expect(urls.find((url) => url.includes('/history/binance'))).toContain(
      'asset=USDT',
    );
    expect(urls.find((url) => url.includes('/history/binance'))).toContain(
      'trade_type=SELL',
    );
    expect(history).toEqual([
      {
        capturedAt: '2026-11-11T08:00:00Z',
        source: 'binance',
        buyRate: 1079.999,
        sellRate: null,
        priceMethod: 'median',
      },
      {
        capturedAt: '2026-11-11T00:00:00.000Z',
        source: 'bcv',
        buyRate: 901.6175,
        sellRate: null,
      },
    ]);
  });
});

describe('fetchBinanceRateHistorySince', () => {
  it('requests only the incremental window with a small page size and drops older samples', async () => {
    const since = Date.parse('2026-11-10T00:00:00.000Z');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        currencies: [
          {
            date: '2026-11-11T08:00:00.000Z',
            median_price: 1_000,
            average_price: 1_001,
          },
          {
            date: '2026-11-09T08:00:00.000Z',
            median_price: 900,
            average_price: 901,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBinanceRateHistorySince(since);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain('start_date=2026-11-10T00:00:00.000Z');
    expect(url).toContain('limit=200');
    expect(result).toHaveLength(1);
    expect(result[0].buyRate).toBe(1_000);
  });
});

describe('fetchHistoricalRateForDate', () => {
  it('returns the exact BCV rate and the local-day median P2P sample', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const targetDate = '2026-11-11';
    const p2pSamples = [
      { date: new Date(2026, 10, 11, 8).toISOString(), median_price: 1_070 },
      { date: new Date(2026, 10, 11, 12).toISOString(), median_price: 1_080 },
      { date: new Date(2026, 10, 11, 16).toISOString(), median_price: 1_090 },
    ];
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({ currencies: p2pSamples })
          : jsonResponse([{ fecha: targetDate, promedio: 900 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchHistoricalRateForDate(targetDate);

    expect(result).toEqual({
      bcv: {
        value: 900,
        capturedAt: `${targetDate}T00:00:00.000Z`,
        forwardFilled: false,
      },
      binance: {
        value: 1_080,
        capturedAt: p2pSamples[1].date,
        method: 'median',
      },
    });
  });

  it('labels the average-price fallback when median is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const targetDate = '2026-11-11';
    const p2pTimestamp = new Date(2026, 10, 11, 12).toISOString();
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({
              currencies: [{ date: p2pTimestamp, average_price: 1_075 }],
            })
          : jsonResponse([{ fecha: targetDate, promedio: 900 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchHistoricalRateForDate(targetDate);

    expect(result.binance).toEqual({
      value: 1_075,
      capturedAt: p2pTimestamp,
      method: 'average',
    });
  });

  it('forward-fills BCV from the latest prior publication', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const targetDate = '2026-11-11';
    const p2pTimestamp = new Date(2026, 10, 11, 12).toISOString();
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({
              currencies: [{ date: p2pTimestamp, median_price: 1_080 }],
            })
          : jsonResponse([{ fecha: '2026-11-10', promedio: 895 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchHistoricalRateForDate(targetDate);

    expect(result.bcv).toEqual({
      value: 895,
      capturedAt: '2026-11-10T00:00:00.000Z',
      forwardFilled: true,
    });
    expect(result.binance).toEqual({
      value: 1_080,
      capturedAt: p2pTimestamp,
      method: 'median',
    });
  });

  it('throws a typed error when the selected date has no P2P samples', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({
              currencies: [
                {
                  date: new Date(2026, 10, 10, 12).toISOString(),
                  median_price: 1_070,
                },
              ],
            })
          : jsonResponse([{ fecha: '2026-11-11', promedio: 900 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHistoricalRateForDate('2026-11-11')).rejects.toBeInstanceOf(
      HistoricalRateLookupError,
    );
  });

  it('keeps an empty P2P history as a typed manual-entry error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({ currencies: [] })
          : jsonResponse([{ fecha: '2026-11-11', promedio: 900 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHistoricalRateForDate('2026-11-11')).rejects.toMatchObject({
      name: 'HistoricalRateLookupError',
      code: 'no-binance-samples',
    });
  });

  it('rejects future and out-of-range dates before making requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHistoricalRateForDate('2026-11-13')).rejects.toMatchObject({
      code: 'future-date',
    });
    await expect(fetchHistoricalRateForDate('2025-11-11')).rejects.toMatchObject({
      code: 'outside-lookback',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

