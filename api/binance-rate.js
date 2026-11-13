const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const REQUEST_TIMEOUT_MS = 7_000;

const P2P_REQUEST_BODY = {
  asset: 'USDT',
  fiat: 'VES',
  merchantCheck: false,
  page: 1,
  rows: 10,
  payTypes: [],
  tradeType: 'SELL',
};

function parsePrice(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function median(prices) {
  const sorted = [...prices].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(BINANCE_P2P_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
      body: JSON.stringify(P2P_REQUEST_BODY),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      response.status(502).json({ error: `Binance respondio con el estado ${upstream.status}.` });
      return;
    }

    const payload = await upstream.json();
    const prices = Array.isArray(payload?.data)
      ? payload.data
          .map((item) => parsePrice(item?.adv?.price))
          .filter((price) => price !== null)
      : [];

    if (prices.length === 0) {
      response.status(502).json({ error: 'Binance P2P no devolvio precios validos.' });
      return;
    }

    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    response.status(200).json({
      value: median(prices),
      provider: 'Binance P2P (proxy)',
    });
  } catch {
    response.status(502).json({ error: 'No se pudo consultar Binance P2P.' });
  } finally {
    clearTimeout(timeout);
  }
}
