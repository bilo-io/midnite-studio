import { useSyncExternalStore } from 'react';

/**
 * The user's primary colour, as the HSL triple the lane palette speaks.
 *
 * The checked-out branch's lane is drawn in `--primary` (Settings > Appearance
 * > Accent), so the graph has to follow that token live: an accent change
 * rewrites `--accent-h/--accent-s` on <html>, and a theme change flips the
 * lightness `--primary` is built with. Neither is a store value the graph can
 * subscribe to — the lightness lives in the shell's stylesheet — so this reads
 * the *resolved* colour off a probe element and watches <html> for the
 * attribute writes that move it.
 *
 * A probe rather than parsing `--primary`: its computed value is
 * `260 calc(80 * 1%) 42%`, and the browser is the one thing that evaluates that.
 */
export type Hsl = [number, number, number];

/** Used before a document exists (tests, SSR) — the app's brand blue. */
export const FALLBACK_PRIMARY: Hsl = [221, 83, 53];

/** sRGB 0-255 to an HSL triple in the units `laneHsl` uses (degrees, %, %). */
export const rgbToHsl = (r: number, g: number, b: number): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [Math.round(((h * 60) % 360 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
};

/** Parse `rgb(r, g, b)` / `rgb(r g b / a)` as returned by getComputedStyle. */
export const parseRgb = (css: string): Hsl | null => {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(css);
  if (!m) return null;
  return rgbToHsl(Number(m[1]), Number(m[2]), Number(m[3]));
};

const readPrimary = (): Hsl => {
  if (typeof document === 'undefined') return FALLBACK_PRIMARY;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;color:hsl(var(--primary))';
  document.body.appendChild(probe);
  const parsed = parseRgb(getComputedStyle(probe).color);
  probe.remove();
  return parsed ?? FALLBACK_PRIMARY;
};

let current: Hsl = FALLBACK_PRIMARY;
let dirty = true;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();

const refresh = (): void => {
  const next = readPrimary();
  dirty = false;
  if (next.join() !== current.join()) {
    current = next;
    listeners.forEach((fn) => fn());
  }
};

/** The resolved primary colour right now. Cheap: re-read only after <html> changes. */
export const getPrimaryHsl = (): Hsl => {
  if (dirty) refresh();
  return current;
};

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  if (!observer && typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver(() => {
      dirty = true;
      refresh();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme', 'data-accent', 'data-accent-gradient'],
    });
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
      dirty = true;
    }
  };
};

/** Re-renders the caller when the primary colour changes; returns it. */
export const usePrimaryHsl = (): Hsl => useSyncExternalStore(subscribe, getPrimaryHsl, getPrimaryHsl);

/** Test seam. */
export const __resetPrimaryLane = (): void => {
  dirty = true;
  current = FALLBACK_PRIMARY;
};
