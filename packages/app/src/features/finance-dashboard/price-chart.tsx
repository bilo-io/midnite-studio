import { useEffect, useMemo, useRef } from 'react';

import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';

import type { MarketCandle } from '@midnite/studio-shared';

import type { ChartType } from './finance-ui-store';

/**
 * The interactive price chart — TradingView's Lightweight Charts (Apache-2.0).
 *
 * **This module is the only importer of `lightweight-charts`, and it is loaded
 * with `React.lazy`** from `big-chart-widget.tsx`, so the library (the one
 * heavy dependency of the Finance dashboard) lands in its own chunk and costs
 * nothing until a board with the chart on it is opened.
 *
 * Attribution: the library's licence asks for TradingView to be credited and
 * linked. The chart's own `attributionLogo` (left on, below) satisfies the link
 * requirement from inside the chart; the card footer carries the notice text.
 *
 * Colours come from the app's CSS tokens, resolved to concrete `rgb()` values
 * (the library cannot read `var(--…)`) and re-resolved whenever the theme
 * flips, so the chart follows light/dark without a remount.
 */

const toSeconds = (t: number): UTCTimestamp => Math.floor(t / 1000) as UTCTimestamp;

/** Resolve `hsl(var(--token) / alpha)` to an `rgb()` string the canvas library can parse. */
function resolveToken(token: string, alpha = 1, fallback = '128,128,128'): string {
  if (typeof document === 'undefined') return `rgba(${fallback},${alpha})`;
  const probe = document.createElement('span');
  probe.style.color = `hsl(var(${token}))`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const match = /rgba?\(([^)]+)\)/.exec(resolved);
  const channels = match?.[1]?.split(/[,\s/]+/).filter(Boolean).slice(0, 3).join(',') ?? fallback;
  return `rgba(${channels},${alpha})`;
}

type Palette = ReturnType<typeof readPalette>;

function readPalette() {
  return {
    text: resolveToken('--muted-foreground', 1),
    grid: resolveToken('--border', 0.5),
    border: resolveToken('--border', 1),
    up: resolveToken('--success', 1, '34,197,94'),
    down: resolveToken('--destructive', 1, '239,68,68'),
    upFade: resolveToken('--success', 0.28, '34,197,94'),
    downFade: resolveToken('--destructive', 0.28, '239,68,68'),
    crosshair: resolveToken('--muted-foreground', 0.7),
  };
}

const precisionFor = (price: number): number => (price >= 1000 ? 2 : price >= 1 ? 2 : price >= 0.01 ? 4 : 6);

export type HoverBar = { t: number; o: number; h: number; l: number; c: number } | null;

export default function PriceChart({
  candles,
  type,
  up,
  intraday,
  onHover,
}: {
  /** Prices already in the display currency. */
  candles: readonly MarketCandle[];
  type: ChartType;
  /** Whether the window ended higher than it began — picks the line/area tone. */
  up: boolean;
  /** Show clock times on the axis rather than dates. */
  intraday: boolean;
  onHover?: (bar: HoverBar) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  // Strictly ascending, one bar per second — the library throws on anything else.
  const data = useMemo(() => {
    const out: MarketCandle[] = [];
    let lastSecond = -1;
    for (const c of candles) {
      const second = Math.floor(c.t / 1000);
      if (second <= lastSecond) continue;
      lastSecond = second;
      out.push(c);
    }
    return out;
  }, [candles]);

  // The chart itself: created once, torn down on unmount.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const palette = readPalette();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.text,
        fontFamily: 'inherit',
        attributionLogo: true,
      },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;

    // Follow the theme: re-resolve every colour when the root's class / data-theme changes.
    const apply = (): void => {
      const p = readPalette();
      chart.applyOptions({
        layout: { textColor: p.text },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        rightPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border },
      });
    };
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // `intraday` only changes the axis format and is applied in its own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { timeVisible: intraday } });
  }, [intraday]);

  // The series: rebuilt whenever the type or the data changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    const p: Palette = readPalette();
    const tone = up ? p.up : p.down;
    const last = data[data.length - 1]?.c ?? 1;
    const priceFormat = { type: 'price' as const, precision: precisionFor(last), minMove: 10 ** -precisionFor(last) };

    chart.applyOptions({
      rightPriceScale: { mode: type === 'percent' ? PriceScaleMode.Percentage : PriceScaleMode.Normal },
    });

    let series: ISeriesApi<SeriesType>;
    if (type === 'candles') {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: p.up,
        downColor: p.down,
        wickUpColor: p.up,
        wickDownColor: p.down,
        borderVisible: false,
        priceFormat,
      });
      s.setData(data.map((c) => ({ time: toSeconds(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
      series = s;
    } else if (type === 'bars') {
      const s = chart.addSeries(BarSeries, { upColor: p.up, downColor: p.down, priceFormat });
      s.setData(data.map((c) => ({ time: toSeconds(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
      series = s;
    } else if (type === 'area') {
      const s = chart.addSeries(AreaSeries, {
        lineColor: tone,
        topColor: up ? p.upFade : p.downFade,
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth: 2,
        priceFormat,
      });
      s.setData(data.map((c) => ({ time: toSeconds(c.t), value: c.c })));
      series = s;
    } else {
      // `line` and `percent` share a series; percent only changes the price scale mode above.
      const s = chart.addSeries(LineSeries, { color: tone, lineWidth: 2, priceFormat });
      s.setData(data.map((c) => ({ time: toSeconds(c.t), value: c.c })));
      series = s;
    }
    seriesRef.current = series;
    chart.timeScale().fitContent();

    const byTime = new Map(data.map((c) => [toSeconds(c.t) as number, c]));
    const onMove = (param: { time?: unknown }): void => {
      const bar = typeof param.time === 'number' ? byTime.get(param.time) : undefined;
      hoverRef.current?.(bar ? { t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c } : null);
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.removeSeries(series);
      if (seriesRef.current === series) seriesRef.current = null;
    };
  }, [data, type, up]);

  return <div ref={container} data-testid="price-chart" className="h-full min-h-[160px] w-full" />;
}
