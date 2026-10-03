import { useId, useMemo, type ReactNode } from 'react';

import { LuArrowDownRight, LuArrowUpRight, LuMinus, LuTriangleAlert } from 'react-icons/lu';

import { Tooltip } from '../../components/tooltip';
import { formatAge, formatSignedPct } from './finance-format';
import type { AllocationSlice, Direction } from './finance-math';

/**
 * The small pieces every Finance card shares — the green/red tone, the gain
 * badge, a hand-drawn sparkline and donut, and the "stale" hint.
 *
 * The charts are plain SVG rather than a library. A sparkline is a polyline and
 * a donut is a few arcs; neither earns a dependency, and the one chart that
 * does (the big interactive one) is lazy-loaded separately.
 */

export const TONE_TEXT: Record<Direction, string> = {
  up: 'text-success',
  down: 'text-destructive',
  flat: 'text-muted-foreground',
};

export const TONE_STROKE: Record<Direction, string> = {
  up: 'hsl(var(--success))',
  down: 'hsl(var(--destructive))',
  flat: 'hsl(var(--muted-foreground))',
};

export const TONE_ARROW = { up: LuArrowUpRight, down: LuArrowDownRight, flat: LuMinus } as const;

/** `▲ +3.21%` in the tone's colour, arrow and text together. */
export function ChangeBadge({
  direction,
  pct,
  abs,
  className = '',
}: {
  direction: Direction;
  pct: number;
  /** An already-formatted absolute change, shown before the percentage. */
  abs?: string;
  className?: string;
}) {
  const Arrow = TONE_ARROW[direction];
  return (
    <span
      data-tone={direction}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums ${TONE_TEXT[direction]} ${className}`}
    >
      <Arrow aria-hidden className="size-3.5 shrink-0" />
      {abs ? <span>{abs}</span> : null}
      <span className={abs ? 'opacity-80' : ''}>{abs ? `(${formatSignedPct(pct)})` : formatSignedPct(pct)}</span>
    </span>
  );
}

// --- sparkline -------------------------------------------------------------------------

/** Points as an SVG path in a `w × h` box, scaled to the series' own min and max. */
export function sparkPath(values: readonly number[], w: number, h: number, pad = 2): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const x = (i: number): number => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number): number => (span === 0 ? h / 2 : pad + (1 - (v - min) / span) * (h - pad * 2));
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join('L')}`;
  return { line, area: `${line}L${w},${h}L0,${h}Z` };
}

export function Sparkline({
  values,
  direction,
  width = 88,
  height = 30,
  area = false,
  label,
  className = '',
}: {
  values: readonly number[];
  direction: Direction;
  width?: number;
  height?: number;
  /** Fill under the line — the Watchlist's "area chart" rows. */
  area?: boolean;
  label?: string;
  className?: string;
}) {
  const gradient = useId();
  const { line, area: fill } = useMemo(() => sparkPath(values, width, height), [values, width, height]);
  const stroke = TONE_STROKE[direction];
  if (values.length < 2) {
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 ${className}`}
        style={{ width, height }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="hsl(var(--muted-foreground) / 0.4)" strokeDasharray="3 3" />
        </svg>
      </span>
    );
  }
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-tone={direction}
      className={`shrink-0 overflow-visible ${className}`}
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity="0.32" />
              <stop offset="1" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gradient})`} />
        </>
      ) : null}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// --- donut ----------------------------------------------------------------------------------

type Arc = { id: string; d: string; color: string };

/** Arc paths for slices around a ring; a lone full slice is drawn as two halves, which an SVG arc needs. */
export function donutArcs(slices: readonly AllocationSlice[], radius: number, gapRad = 0.012): Arc[] {
  const arcs: Arc[] = [];
  let angle = -Math.PI / 2;
  const point = (a: number): string => `${(radius * Math.cos(a)).toFixed(3)} ${(radius * Math.sin(a)).toFixed(3)}`;
  for (const slice of slices) {
    const sweep = slice.share * Math.PI * 2;
    if (sweep <= 0) continue;
    const gap = slices.length > 1 ? Math.min(gapRad, sweep / 3) : 0;
    const start = angle + gap / 2;
    const end = angle + sweep - gap / 2;
    const mid = (start + end) / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const d =
      slices.length === 1
        ? `M${point(start)}A${radius} ${radius} 0 1 1 ${point(mid)}A${radius} ${radius} 0 1 1 ${point(start)}`
        : `M${point(start)}A${radius} ${radius} 0 ${large} 1 ${point(end)}`;
    arcs.push({ id: slice.id, d, color: slice.color });
    angle += sweep;
  }
  return arcs;
}

export function Donut({
  slices,
  size = 150,
  thickness = 16,
  activeId,
  onActive,
  children,
}: {
  slices: readonly AllocationSlice[];
  size?: number;
  thickness?: number;
  activeId?: string | null;
  onActive?: (id: string | null) => void;
  /** Centre content — the total. */
  children?: ReactNode;
}) {
  const radius = size / 2 - thickness / 2 - 2;
  const arcs = useMemo(() => donutArcs(slices, radius), [slices, radius]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img" aria-label="Portfolio allocation">
        <circle r={radius} fill="none" stroke="hsl(var(--muted) / 0.6)" strokeWidth={thickness} />
        {arcs.map((arc) => (
          <path
            key={arc.id}
            d={arc.d}
            fill="none"
            stroke={arc.color}
            strokeWidth={activeId === arc.id ? thickness + 4 : thickness}
            strokeLinecap="butt"
            opacity={activeId && activeId !== arc.id ? 0.35 : 1}
            style={{ transition: 'stroke-width 150ms, opacity 150ms' }}
            onMouseEnter={() => onActive?.(arc.id)}
            onMouseLeave={() => onActive?.(null)}
            data-slice={arc.id}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// --- stale hint ----------------------------------------------------------------------------------

/** A quiet amber note that what is on screen is the last known data, not a live answer. */
export function StaleHint({
  stale,
  fetchedAt,
  what = 'Prices',
}: {
  stale: boolean;
  fetchedAt: number | null;
  what?: string;
}) {
  if (!stale) return null;
  return (
    <Tooltip label={`${what} could not be refreshed — showing the last known data (${formatAge(fetchedAt)}).`}>
      <span
        data-testid="stale-hint"
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
      >
        <LuTriangleAlert aria-hidden className="size-3" />
        stale
      </span>
    </Tooltip>
  );
}

/** Segmented single-choice control — the timescale and chart-type pickers. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`rounded px-2 ${size === 'sm' ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} font-medium tabular-nums transition-colors ${
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
