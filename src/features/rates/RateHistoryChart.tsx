import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { PurchaseRecord } from '../../domain/types';
import { formatDate, formatPct, formatRate } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { HistoricalRateSample } from './ratesApi';
import { getRateHistory } from './rateHistoryCache';
import {
  buildBreakEvenSeries,
  buildRateHistory,
  type HistoryRange,
  type RateHistoryPoint,
  type RateHistorySeries,
} from './rateHistory';
import styles from './RateHistoryChart.module.css';

type ChartMode = 'price' | 'gap';

const RANGE_OPTIONS: Array<{ value: HistoryRange; label: string }> = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 d' },
  { value: '30d', label: '30 d' },
  { value: '90d', label: '90 d' },
];

const CHART_WIDTH = 900;
const CHART_HEIGHT = 320;
const CHART_PADDING = { top: 18, right: 64, bottom: 36, left: 62 };
const THIRTY_DAY_POINT_COUNT = 30;

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible cargar el histórico de tasas.';
}

function purchasePinTimestamp(purchase: PurchaseRecord): string {
  if (!purchase.purchaseDate) return purchase.createdAt;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(purchase.purchaseDate);
  if (!match) return purchase.createdAt;
  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function pointValue(point: RateHistoryPoint, mode: ChartMode): number | null {
  if (mode === 'gap') return point.gapPct ?? null;
  return point.p2p ?? null;
}

function buildLineSegments(
  points: RateHistoryPoint[],
  mode: ChartMode,
  xFor: (point: RateHistoryPoint) => number,
  yFor: (value: number) => number,
  isDashedGap: (previous: RateHistoryPoint, current: RateHistoryPoint) => boolean,
): Array<{ d: string; dashed: boolean }> {
  const known = points.filter((point) => pointValue(point, mode) !== null);
  const segments: Array<{ d: string; dashed: boolean }> = [];

  for (let index = 1; index < known.length; index += 1) {
    const previous = known[index - 1];
    const current = known[index];
    const previousValue = pointValue(previous, mode);
    const currentValue = pointValue(current, mode);
    if (previousValue === null || currentValue === null) continue;

    segments.push({
      d: `M ${xFor(previous)} ${yFor(previousValue)} L ${xFor(current)} ${yFor(currentValue)}`,
      dashed: isDashedGap(previous, current),
    });
  }

  return segments;
}

function pointTitle(point: RateHistoryPoint, range: HistoryRange): string {
  const p2p = point.p2p === undefined ? '-' : `${formatRate(point.p2p)} Bs.S`;
  const bcv = point.bcv === undefined ? '-' : `${formatRate(point.bcv)} Bs.S`;
  const gap = point.gapPct === undefined ? '-' : formatPct(point.gapPct, 2);

  if (range === '7d' && point.open !== undefined && point.close !== undefined) {
    return `${point.label} · BCV ${bcv} · P2P ${p2p} · Brecha ${gap} · Apertura ${formatRate(point.open)} · Cierre ${formatRate(point.close)} · Máx ${formatRate(point.max ?? point.close)} · Mín ${formatRate(point.min ?? point.close)}`;
  }

  if (range === '30d' || range === '90d') {
    return `${point.label} · BCV ${bcv} · P2P promedio ${p2p} · Brecha ${gap}`;
  }

  return `${point.label} · BCV ${bcv} · P2P ${p2p} · Brecha ${gap}`;
}

export function RateHistoryChart() {
  const purchases = useAppStore((state) => state.purchases);
  const sales = useAppStore((state) => state.sales);
  const [range, setRange] = useState<HistoryRange>('7d');
  const [mode, setMode] = useState<ChartMode>('price');
  const [samples, setSamples] = useState<HistoricalRateSample[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getRateHistory({ forceRefresh: reloadKey > 0 })
      .then((result) => {
        if (!cancelled) setSamples(result);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setSamples(null);
          setError(getErrorMessage(fetchError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const series = useMemo<RateHistorySeries | null>(
    () => (samples ? buildRateHistory(samples, range) : null),
    [range, samples],
  );

  useEffect(() => {
    const element = chartWrapRef.current;
    if (!element) return;

    const updateWidth = (): void => {
      setChartAreaWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, series]);

  const chartWidth = useMemo(() => {
    if (range !== '90d' || !series) return CHART_WIDTH;

    const pointCount = series.points.length;
    if (pointCount <= 1) return CHART_WIDTH;

    const measuredWidth = chartAreaWidth > 0 ? chartAreaWidth : CHART_WIDTH;
    const baseChartWidth = Math.max(measuredWidth, 620);
    const basePlotWidth =
      (baseChartWidth * (CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right)) /
      CHART_WIDTH;
    const basePointSpacing = basePlotWidth / (THIRTY_DAY_POINT_COUNT - 1);
    const plotWidth = (pointCount - 1) * basePointSpacing;

    return Math.ceil(CHART_PADDING.left + CHART_PADDING.right + plotWidth);
  }, [chartAreaWidth, range, series]);

  const latestPurchase = useMemo(() => {
    return (
      [...purchases]
        .filter((purchase) => purchase.status !== 'cancelled')
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        )[0] ?? null
    );
  }, [purchases]);

  const breakEvenSeries = useMemo(
    () =>
      mode === 'price' && series
        ? buildBreakEvenSeries(series.points, latestPurchase)
        : [],
    [latestPurchase, mode, series],
  );

  const plot = useMemo(() => {
    if (!series) return null;

    const points = series.points;
    const priceKnown = points.filter(
      (point) =>
        point.p2p !== undefined ||
        point.bcv !== undefined ||
        point.open !== undefined ||
        point.close !== undefined,
    );
    const gapKnown = points.filter((point) => point.gapPct !== undefined);
    if (priceKnown.length === 0 && gapKnown.length === 0) return null;

    const firstTimestamp = points[0]?.timestamp ?? Date.now();
    const lastTimestamp = points[points.length - 1]?.timestamp ?? firstTimestamp;
    const timeSpan = Math.max(1, lastTimestamp - firstTimestamp);
    const plotWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const xFor = (point: RateHistoryPoint): number =>
      CHART_PADDING.left +
      ((point.timestamp - firstTimestamp) / timeSpan) * plotWidth;

    const buildScale = (values: number[]) => {
      const safeValues = values.filter((value) => Number.isFinite(value));
      const effectiveValues = safeValues.length > 0 ? safeValues : [0, 1];
      const rawMin = Math.min(...effectiveValues);
      const rawMax = Math.max(...effectiveValues);
      const spread = rawMax - rawMin;
      const padding =
        spread > 0 ? spread * 0.12 : Math.max(1, Math.abs(rawMax) * 0.02);
      const min = rawMin - padding;
      const max = rawMax + padding;
      const yFor = (value: number): number =>
        CHART_PADDING.top +
        ((max - value) / Math.max(0.0001, max - min)) * plotHeight;
      return { min, max, yFor };
    };

    const priceValues: number[] = [];
    for (const point of points) {
      if (point.p2p !== undefined) priceValues.push(point.p2p);
      if (point.bcv !== undefined) priceValues.push(point.bcv);
      if (point.open !== undefined) priceValues.push(point.open);
      if (point.close !== undefined) priceValues.push(point.close);
      if (point.min !== undefined) priceValues.push(point.min);
      if (point.max !== undefined) priceValues.push(point.max);
    }
    if (mode === 'price') {
      for (const point of breakEvenSeries) priceValues.push(point.rate);
    }

    const gapValues: number[] = [0];
    for (const point of points) {
      if (point.gapPct !== undefined) gapValues.push(point.gapPct);
    }

    const priceScale = buildScale(priceValues);
    const gapScale = buildScale(gapValues);
    const yForPrice = priceScale.yFor;
    const yForGap = gapScale.yFor;

    const maxGapMs =
      series.granularity === 'hour'
        ? 1.5 * 60 * 60 * 1000
        : 1.5 * 24 * 60 * 60 * 1000;
    const isDashedGap = (
      previous: RateHistoryPoint,
      current: RateHistoryPoint,
    ): boolean => current.timestamp - previous.timestamp > maxGapMs;

    const breakEvenPoints = breakEvenSeries.map((point) => ({
      ...point,
      x: xFor({
        timestamp: point.timestamp,
        label: point.label,
        sampleCount: 1,
      }),
      y: yForPrice(point.rate),
    }));
    const breakEvenSegments: Array<{ d: string; dashed: boolean }> = [];

    for (let index = 1; index < breakEvenPoints.length; index += 1) {
      const previous = breakEvenPoints[index - 1];
      const current = breakEvenPoints[index];
      breakEvenSegments.push({
        d: `M ${previous.x} ${previous.y} L ${current.x} ${current.y}`,
        dashed: current.timestamp - previous.timestamp > maxGapMs,
      });
    }

    const p2pSegments = buildLineSegments(
      points,
      'price',
      xFor,
      yForPrice,
      isDashedGap,
    );
    const bcvSegments = buildLineSegments(
      points.map((point) => ({ ...point, p2p: point.bcv })),
      'price',
      xFor,
      yForPrice,
      isDashedGap,
    );
    const gapSegments = buildLineSegments(
      points,
      'gap',
      xFor,
      yForGap,
      isDashedGap,
    );

    const buildTicks = (
      min: number,
      max: number,
      yFor: (value: number) => number,
    ) =>
      Array.from({ length: 5 }, (_, index) => {
        const value = max - ((max - min) / 4) * index;
        return { value, y: yFor(value) };
      });

    const priceTicks = buildTicks(priceScale.min, priceScale.max, yForPrice);
    const gapTicks = buildTicks(gapScale.min, gapScale.max, yForGap);

    const xTickDivisions = range === '90d' ? 12 : 3;
    const xTickIndexes = Array.from(
      { length: xTickDivisions + 1 },
      (_, index) => Math.round((index * (points.length - 1)) / xTickDivisions),
    )
      .filter((value, index, array) => array.indexOf(value) === index)
      .filter((value) => value >= 0 && value < points.length);
    const xTicks = xTickIndexes.map((index) => ({
      x: xFor(points[index]),
      label: points[index].label,
    }));

    const bandPoints = series.granularity === 'open-close'
      ? points.filter((point) => point.min !== undefined && point.max !== undefined)
      : [];

    const knownPoints = points.filter((point) => point.p2p !== undefined);
    const nearestPoint = (timestamp: number): RateHistoryPoint | null => {
      if (knownPoints.length === 0) return null;
      return knownPoints.reduce((nearest, point) =>
        Math.abs(point.timestamp - timestamp) < Math.abs(nearest.timestamp - timestamp)
          ? point
          : nearest,
      );
    };
    const pins: Array<{
      kind: 'purchase' | 'sale';
      x: number;
      y: number;
      label: string;
    }> = [];

    const addPin = (
      createdAt: string,
      kind: 'purchase' | 'sale',
      amount: string,
    ): void => {
      const timestamp = Date.parse(createdAt);
      if (!Number.isFinite(timestamp) || timestamp < firstTimestamp || timestamp > lastTimestamp) {
        return;
      }
      const point = nearestPoint(timestamp);
      if (!point) return;
      const value = point.p2p;
      if (value === undefined) return;
      pins.push({
        kind,
        x: xFor(point),
        y: yForPrice(value),
        label: `${kind === 'purchase' ? 'Compra' : 'Venta'} ${formatDate(createdAt)} · ${amount}`,
      });
    };

    for (const purchase of purchases) {
      addPin(purchasePinTimestamp(purchase), 'purchase', `${formatRate(purchase.usdBought)} USD`);
    }
    for (const sale of sales) {
      addPin(sale.createdAt, 'sale', `${formatRate(sale.totalUsdtSold)} USDT`);
    }

    return {
      points,
      xFor,
      yForPrice,
      yForGap,
      priceTicks,
      gapTicks,
      xTicks,
      p2pSegments,
      bcvSegments,
      gapSegments,
      bandPoints,
      breakEvenPoints,
      breakEvenSegments,
      pins,
      pointSpacing: plotWidth / Math.max(1, points.length - 1),
      firstTimestamp,
      lastTimestamp,
    };
  }, [breakEvenSeries, chartWidth, mode, purchases, range, sales, series]);


  return (
    <Card
      title="Histórico de tasas y brecha"
      className={styles.card}
      actions={
        <div className={styles.rangeSelector} role="group" aria-label="Rango histórico">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`${styles.rangeButton} ${
                range === option.value ? styles.rangeButtonActive : ''
              }`}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <div className={styles.modeRow}>
        <div className={styles.modeSelector} role="group" aria-label="Vista de la gráfica">
          <button
            className={`${styles.modeButton} ${mode === 'price' ? styles.modeButtonActive : ''}`}
            type="button"
            aria-pressed={mode === 'price'}
            onClick={() => setMode('price')}
          >
            Precio
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'gap' ? styles.modeButtonActive : ''}`}
            type="button"
            aria-pressed={mode === 'gap'}
            onClick={() => setMode('gap')}
          >
            Brecha %
          </button>
        </div>
        <span className={styles.sourceNote}>
          Fuente: dolar-vzla.rafnixg.dev (P2P) · DolarApi (BCV)
        </span>
      </div>

      {loading && <p className={styles.stateMessage}>Cargando histórico...</p>}

      {!loading && error && (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !error && series && !plot && (
        <p className={styles.stateMessage}>
          No hay suficientes datos para este rango. Se muestran los datos disponibles desde que
          la fuente comenzó a registrar.
        </p>
      )}

      {!loading && !error && series && plot && (
        <>
          <div className={styles.chartWrap} ref={chartWrapRef}>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
              style={
                range === '90d'
                  ? { width: chartWidth, minWidth: chartWidth }
                  : undefined
              }
              role="img"
              aria-label={`Histórico de tasas y brecha para los últimos ${range}`}
            >
              {plot.priceTicks.map((tick) => (
                <g key={`price-${tick.value}`}>
                  <line
                    className={styles.gridLine}
                    x1={CHART_PADDING.left}
                    x2={chartWidth - CHART_PADDING.right}
                    y1={tick.y}
                    y2={tick.y}
                  />
                  <text
                    className={styles.axisLabel}
                    x={CHART_PADDING.left - 8}
                    y={tick.y + 4}
                    textAnchor="end"
                  >
                    {formatRate(tick.value)}
                  </text>
                </g>
              ))}

              {mode === 'gap' &&
                plot.gapTicks.map((tick) => (
                  <text
                    key={`gap-${tick.value}`}
                    className={styles.gapAxisLabel}
                    data-axis="gap"
                    x={chartWidth - CHART_PADDING.right + 8}
                    y={tick.y + 4}
                    textAnchor="start"
                  >
                    {formatPct(tick.value, 1)}
                  </text>
                ))}

              {plot.xTicks.map((tick) => (
                <text
                  key={`${tick.label}-${tick.x}`}
                  className={styles.axisLabel}
                  x={tick.x}
                  y={CHART_HEIGHT - 10}
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              ))}

              {plot.bandPoints.length > 1 && (
                <path
                  className={styles.rangeBand}
                  d={`${plot.bandPoints
                    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${plot.xFor(point)} ${plot.yForPrice(point.max as number)}`)
                    .join(' ')} ${[...plot.bandPoints]
                    .reverse()
                    .map((point) => `L ${plot.xFor(point)} ${plot.yForPrice(point.min as number)}`)
                    .join(' ')} Z`}
                />
              )}

              {plot.bcvSegments.map((segment, index) => (
                <path
                  key={`bcv-${index}`}
                  className={styles.bcvLine}
                  d={segment.d}
                  fill="none"
                />
              ))}

              {plot.p2pSegments.map((segment, index) => (
                <path
                  key={`p2p-${index}`}
                  className={styles.p2pLine}
                  d={segment.d}
                  fill="none"
                  strokeDasharray={segment.dashed ? '5 4' : undefined}
                />
              ))}

              {mode === 'gap' &&
                plot.gapSegments.map((segment, index) => (
                  <path
                    key={`gap-line-${index}`}
                    className={styles.gapLine}
                    d={segment.d}
                    fill="none"
                    strokeDasharray={segment.dashed ? '5 4' : undefined}
                  />
                ))}

              {plot.breakEvenSegments.map((segment, index) => (
                <path
                  key={`break-even-${index}`}
                  className={styles.breakEvenLine}
                  d={segment.d}
                  fill="none"
                  strokeDasharray={segment.dashed ? '5 4' : undefined}
                />
              ))}

              {plot.breakEvenPoints.map((point) => (
                <circle
                  key={`break-even-point-${point.timestamp}`}
                  className={styles.breakEvenMarker}
                  data-series="break-even"
                  cx={point.x}
                  cy={point.y}
                  r={3.5}
                >
                    <title>
                      {`${point.label} · Tasa mínima ${formatRate(point.rate)} Bs.S`}
                    </title>
                </circle>
              ))}

              {series.granularity === 'open-close' &&
                plot.points.map((point) => (
                  <g key={`open-close-${point.timestamp}`}>
                    {point.open !== undefined && (
                      <circle
                        className={styles.openMarker}
                        data-series="p2p-open"
                        cx={plot.xFor(point)}
                        cy={plot.yForPrice(point.open)}
                        r={3.5}
                      >
                        <title>{pointTitle(point, range)}</title>
                      </circle>
                    )}
                    {point.close !== undefined && (
                      <circle
                        className={styles.p2pMarker}
                        data-series="p2p"
                        cx={plot.xFor(point)}
                        cy={plot.yForPrice(point.close)}
                        r={3.5}
                      >
                        <title>{pointTitle(point, range)}</title>
                      </circle>
                    )}
                    {point.bcv !== undefined && (
                      <circle
                        className={styles.bcvMarker}
                        data-series="bcv"
                        cx={plot.xFor(point)}
                        cy={plot.yForPrice(point.bcv)}
                        r={3.5}
                      >
                        <title>{pointTitle(point, range)}</title>
                      </circle>
                    )}
                    {mode === 'gap' && point.gapPct !== undefined && (
                      <circle
                        className={styles.gapMarker}
                        data-series="gap"
                        cx={plot.xFor(point)}
                        cy={plot.yForGap(point.gapPct)}
                        r={3.5}
                      >
                        <title>{pointTitle(point, range)}</title>
                      </circle>
                    )}
                  </g>
                ))}

              {series.granularity !== 'open-close' &&
                plot.points.map((point) => {
                  const hasPrice =
                    point.p2p !== undefined || point.bcv !== undefined;
                  const hasGap = point.gapPct !== undefined;
                  if (!hasPrice && !(mode === 'gap' && hasGap)) return null;

                  return (
                    <g key={`${point.timestamp}`}>
                      {point.p2p !== undefined && (
                        <circle
                          className={styles.p2pMarker}
                          data-series="p2p"
                          cx={plot.xFor(point)}
                          cy={plot.yForPrice(point.p2p)}
                          r={3}
                        >
                          <title>{pointTitle(point, range)}</title>
                        </circle>
                      )}
                      {point.bcv !== undefined && (
                        <circle
                          className={styles.bcvMarker}
                          data-series="bcv"
                          cx={plot.xFor(point)}
                          cy={plot.yForPrice(point.bcv)}
                          r={3}
                        >
                          <title>{pointTitle(point, range)}</title>
                        </circle>
                      )}
                      {mode === 'gap' && point.gapPct !== undefined && (
                        <circle
                          className={styles.gapMarker}
                          data-series="gap"
                          cx={plot.xFor(point)}
                          cy={plot.yForGap(point.gapPct)}
                          r={3}
                        >
                          <title>{pointTitle(point, range)}</title>
                        </circle>
                      )}
                    </g>
                  );
                })}

              {plot.points
                .filter(
                  (point) =>
                    point.p2p !== undefined ||
                    point.bcv !== undefined ||
                    point.gapPct !== undefined,
                )
                .map((point) => {
                  const centerX = plot.xFor(point);
                  const halfWidth = Math.max(1, plot.pointSpacing / 2);
                  const startX = Math.max(
                    CHART_PADDING.left,
                    centerX - halfWidth,
                  );
                  const endX = Math.min(
                    chartWidth - CHART_PADDING.right,
                    centerX + halfWidth,
                  );

                  return (
                    <rect
                      key={`hit-area-${point.timestamp}`}
                      className={styles.hitArea}
                      data-hit-area="true"
                      x={startX}
                      y={CHART_PADDING.top}
                      width={Math.max(1, endX - startX)}
                      height={CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom}
                    >
                      <title>{pointTitle(point, range)}</title>
                    </rect>
                  );
                })}

              {plot.pins.map((pin, index) =>
                pin.kind === 'purchase' ? (
                  <polygon
                    key={`pin-${index}`}
                    className={styles.purchasePin}
                    points={`${pin.x},${pin.y - 5} ${pin.x - 4.5},${pin.y + 4} ${pin.x + 4.5},${pin.y + 4}`}
                  >
                    <title>{pin.label}</title>
                  </polygon>
                ) : (
                  <circle
                    key={`pin-${index}`}
                    className={styles.salePin}
                    cx={pin.x}
                    cy={pin.y}
                    r={4}
                  >
                    <title>{pin.label}</title>
                  </circle>
                ),
              )}
            </svg>
          </div>

          <p
            className={`${styles.chartScrollHint} ${
              range === '90d' ? styles.chartScrollHintVisible : ''
            }`}
          >
            Deslizá horizontalmente para explorar todo el período.
          </p>

          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.bcvSwatch} />
              BCV
            </span>
            <span className={styles.legendItem}>
              <span className={styles.p2pSwatch} />
              Binance P2P
            </span>
            {mode === 'gap' && (
              <span className={styles.legendItem}>
                <span className={styles.gapSwatch} />
                Brecha %
              </span>
            )}
            {series.granularity === 'open-close' && (
              <>
                <span className={styles.legendItem}>
                  <span className={styles.openSwatch} />
                  Apertura
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.rangeSwatch} />
                  Rango mín/máx
                </span>
              </>
            )}
            {mode === 'price' && plot.breakEvenPoints.length > 0 && (
              <span className={styles.legendItem}>
                <span className={styles.breakEvenSwatch} />
                Tasa mínima
              </span>
            )}
            {plot.pins.some((pin) => pin.kind === 'purchase') && (
              <span className={styles.legendItem}>
                <span className={styles.purchaseSwatch} />
                Compra
              </span>
            )}
            {plot.pins.some((pin) => pin.kind === 'sale') && (
              <span className={styles.legendItem}>
                <span className={styles.saleSwatch} />
                Venta
              </span>
            )}
            <span className={styles.legendHint}>
              {mode === 'gap'
                ? 'Precio en el eje izquierdo; brecha % en el eje derecho.'
                : series.granularity === 'hour'
                  ? 'Puntos por hora; las horas sin datos se unen con línea punteada.'
                  : series.granularity === 'open-close'
                    ? 'Apertura y cierre diarios; banda de mínimo y máximo.'
                    : 'Promedio diario.'}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

