import {
  accentHues,
  brand,
  color,
  motion,
  overlay,
  radius,
  shadow,
  spacing,
  typography,
  type ColorScale,
  type Hsl,
} from '@bilo-io/ui/tokens';
import { Easing, Platform } from 'react-native';

// The bridge from @bilo-io/ui's tokens to React Native style values. The tokens
// are CSS-shaped (bare HSL triplets, rem lengths); RN wants colour strings it
// can parse and numbers in dp. Nothing here holds a value of its own: every
// colour and radius is read from `@bilo-io/ui/tokens`, so the two libraries
// cannot drift.

export type ColorScheme = 'light' | 'dark';
export type ColorName = keyof ColorScale;

/** px per rem when a token length is turned into dp — the browser default the web build assumes. */
const REM = 16;

/**
 * `240 10% 3.9%` → `hsl(240, 10%, 3.9%)` (or `hsla(…, alpha)`). The comma
 * form, because every React Native version's colour parser accepts it.
 */
export function hsl(triplet: Hsl, alpha?: number): string {
  const [h, s, l] = triplet.trim().split(/\s+/);
  return alpha === undefined ? `hsl(${h}, ${s}, ${l})` : `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

/** An `hsl()` colour from the theme at an alpha (`hsl(…)` → `hsla(…, alpha)`); for accents, which `alpha()` does not cover. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^hsla?\(([^,]+),\s*([^,]+),\s*([^,)]+)(?:,[^)]*)?\)$/.exec(color.trim());
  if (!match) throw new Error(`ui-native: cannot add alpha to "${color}"`);
  return `hsla(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

/** A token length (`0.5rem`, `4px`, `calc(0.5rem - 2px)`) in dp. */
export function toDp(length: string): number {
  const body = length.trim().replace(/^calc\((.*)\)$/, '$1');
  let total = 0;
  let sign = 1;
  for (const part of body.split(/\s+/)) {
    if (part === '+' || part === '-') {
      sign = part === '-' ? -1 : 1;
      continue;
    }
    const match = /^(-?[\d.]+)(rem|px)?$/.exec(part);
    if (!match) throw new Error(`ui-native: cannot read the token length "${length}"`);
    total += sign * Number(match[1]) * (match[2] === 'rem' ? REM : 1);
  }
  return total;
}

/** Where `t` (0–1) falls along a ramp of HSL stops, as an `hsl()` colour. */
export function rampAt(stops: readonly Hsl[], t: number): string {
  const at = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(at), stops.length - 2);
  const parse = (triplet: Hsl) => triplet.split(/\s+/).map((v) => parseFloat(v));
  const a = parse(stops[i]!);
  const b = parse(stops[i + 1]!);
  const f = at - i;
  const [h, s, l] = a.map((v, k) => +(v + (b[k]! - v) * f).toFixed(1));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export type SpaceStep = keyof typeof spacing;
export type TypeStep = keyof typeof typography.fontSize;
export type ElevationLevel = 0 | 1 | 2 | 3;
export type StatusAccent = keyof (typeof accentHues.status)['light'];
export type KindAccent = keyof (typeof accentHues.kind)['light'];

/** A ready-made shadow style: iOS shadow keys plus the Android `elevation`. */
export type ElevationStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type Theme = {
  scheme: ColorScheme;
  /** Every semantic colour token, ready for a style. */
  colors: Record<ColorName, string>;
  /** A token at an alpha: the native spelling of Tailwind's `bg-primary/90`. */
  alpha: (name: ColorName, alpha: number) => string;
  /** The radius scale in dp (`lg` is the base `--radius`). */
  radius: { sm: number; md: number; lg: number; full: number };
  /** Spacing in dp, keyed by the Tailwind step (`space[4]` is 16). */
  space: Record<SpaceStep, number>;
  /** Font size and line height in dp per step. */
  type: Record<TypeStep, { fontSize: number; lineHeight: number }>;
  font: {
    regular: '400';
    medium: '500';
    semibold: '600';
    /** `Menlo` on iOS, `monospace` elsewhere. */
    mono: string;
  };
  /** Shadow styles, levels 0 (none) to 3 (FAB). */
  elevation: Record<ElevationLevel, ElevationStyle>;
  /** Durations in ms and the standard easing. */
  motion: { fast: number; base: number; slow: number; easing: (t: number) => number };
  /** Domain accents as colours, for this scheme. */
  accents: { status: Record<StatusAccent, string>; kind: Record<KindAccent, string> };
  /** The overlay behind a sheet or speed dial. */
  scrim: string;
  brand: {
    /** The six HSL stops of the wordmark ramp, left to right. */
    ramp: readonly Hsl[];
    glow: string;
    /** The face "Midnite" is set in; undefined falls back to the platform face. */
    fontFamily: string | undefined;
  };
};

export type ThemeOptions = {
  /** The family name the app registered the Damion face under, if it loaded one. */
  brandFontFamily?: string;
};

function mapValues<K extends string, V, R>(
  source: Record<K, V>,
  fn: (value: V) => R,
): Record<K, R> {
  return Object.fromEntries(
    Object.entries<V>(source).map(([key, value]) => [key, fn(value)]),
  ) as Record<K, R>;
}

export function createTheme(scheme: ColorScheme, options: ThemeOptions = {}): Theme {
  const scale = color[scheme];
  const colors = Object.fromEntries(
    Object.entries(scale).map(([name, triplet]) => [name, hsl(triplet)]),
  ) as Record<ColorName, string>;
  return {
    scheme,
    colors,
    alpha: (name, alpha) => hsl(scale[name], alpha),
    radius: {
      sm: toDp(radius.sm),
      md: toDp(radius.md),
      lg: toDp(radius.lg),
      full: toDp(radius.full),
    },
    space: mapValues(spacing, toDp),
    type: mapValues(typography.fontSize, (v) => ({
      fontSize: toDp(v.fontSize),
      lineHeight: toDp(v.lineHeight),
    })),
    font: {
      regular: String(typography.fontWeight.regular) as '400',
      medium: String(typography.fontWeight.medium) as '500',
      semibold: String(typography.fontWeight.semibold) as '600',
      mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },
    elevation: Object.fromEntries(
      (['0', '1', '2', '3'] as const).map((level) => {
        const step = shadow[level];
        return [
          level,
          {
            shadowColor: hsl(overlay.scrim.hsl),
            shadowOffset: { width: 0, height: toDp(step.offsetY) },
            shadowOpacity: step.opacity,
            shadowRadius: toDp(step.blur),
            elevation: step.elevation,
          },
        ];
      }),
    ) as Theme['elevation'],
    motion: {
      ...motion.duration,
      easing: Easing.bezier(...motion.easing.standard),
    },
    accents: {
      status: mapValues(accentHues.status[scheme], (v) => hsl(v)),
      kind: mapValues(accentHues.kind[scheme], (v) => hsl(v)),
    },
    scrim: hsl(overlay.scrim.hsl, overlay.scrim.alpha),
    brand: {
      ramp: brand[scheme].ramp,
      glow: hsl(brand[scheme].glow),
      fontFamily: options.brandFontFamily,
    },
  };
}
