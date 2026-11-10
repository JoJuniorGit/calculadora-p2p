import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBinanceRate } from './ratesApi';

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  });
});
