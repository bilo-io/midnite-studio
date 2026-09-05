import type { ScanCategory } from '@midnite/studio-shared';

/**
 * Storage-bar colours (Phase 59 Theme B) — a second, separate palette from
 * `metric-palette.ts`'s, not an extension of it.
 *
 * `metric-palette.ts`'s exports are all `(id: MetricId)` over a closed union
 * that flows into `MetricSampleSchema`, the footer and `metricsPresent`;
 * widening it to carry storage categories would change the metrics contract
 * just to colour a bar. `ScanCategory` has no `MetricId` member and never
 * will — Decision 12 in the phase doc. Hues below are chosen to sit clear of
 * `METRIC_HUES` (cpu 210, memory 280, gpu 160, disk 35), so a category chip
 * beside a footer sparkline never reads as "the same series, different
 * component."
 */

type Hsl = readonly [number, number, number];

const CATEGORY_HUES: Record<ScanCategory, Hsl> = {
  nodeModules: [350, 70, 58], // rose
  buildOutput: [115, 55, 45], // green
  staleWorktree: [20, 75, 55], // burnt orange
  looseObjects: [265, 55, 62], // indigo — unused until a later phase populates it
};

export const categoryHsl = (category: ScanCategory): Hsl => CATEGORY_HUES[category];

export const categoryColor = (category: ScanCategory): string => {
  const [h, s, l] = categoryHsl(category);
  return `hsl(${h} ${s}% ${l}%)`;
};

export const categoryFill = (category: ScanCategory, alpha: number): string => {
  const [h, s, l] = categoryHsl(category);
  return `hsl(${h} ${s}% ${l}% / ${alpha})`;
};

export const CATEGORY_LABELS: Record<ScanCategory, string> = {
  nodeModules: 'node_modules',
  buildOutput: 'Build output',
  staleWorktree: 'Stale worktrees',
  looseObjects: 'Loose objects',
};
