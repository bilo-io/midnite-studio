import { EcosystemSchema, type Ecosystem, type ScanCategory } from '@midnite/studio-shared';

/**
 * Storage-bar colours (Phase 59 Theme B, widened by Phase 72 Theme D) — a
 * second, separate palette from `metric-palette.ts`'s, not an extension of
 * it.
 *
 * `metric-palette.ts`'s exports are all `(id: MetricId)` over a closed union
 * that flows into `MetricSampleSchema`, the footer and `metricsPresent`;
 * widening it to carry storage categories would change the metrics contract
 * just to colour a bar. `ScanCategory` has no `MetricId` member and never
 * will — Decision 12 in the phase doc. Hues below are chosen to sit clear of
 * `METRIC_HUES` (cpu 210, memory 280, gpu 160, disk 35), so a category chip
 * beside a footer sparkline never reads as "the same series, different
 * component."
 *
 * Two orthogonal axes, two hue tables (Decision 3): `CATEGORY_HUES` colours
 * *within* a legend-bearing bar, `ECOSYSTEM_HUES` colours the bar that groups
 * by ecosystem above it. The category axis needs its five hues distinguishable
 * from each other and from `METRIC_HUES` in isolation; the ecosystem axis
 * only needs its eleven hues distinguishable from their neighbours in an
 * ordered, legend-bearing, per-segment-tooltip bar — a materially weaker
 * requirement, which is what makes eleven hues fit at all. Both tables are
 * still held ≥12° clear of every `CATEGORY_HUES` and `METRIC_HUES` entry
 * (asserted in `category-palette.test.ts`), so an ecosystem segment never
 * gets mistaken for a category segment or a footer metric.
 */

export type Hsl = readonly [number, number, number];

/** Exported for `category-palette.test.ts`'s hue-separation assertion. */
export const CATEGORY_HUES: Record<ScanCategory, Hsl> = {
  dependencies: [350, 70, 58], // rose — was `nodeModules` (Phase 72 Theme C rename)
  buildOutput: [115, 55, 45], // green
  toolCache: [55, 60, 55], // amber — new in Phase 72 Theme C, ≥20° clear of every existing/METRIC_HUES entry
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
  dependencies: 'Dependencies',
  buildOutput: 'Build output',
  toolCache: 'Tool cache',
  staleWorktree: 'Stale worktrees',
  looseObjects: 'Loose objects',
};

/**
 * Single exported ordering, replacing the two hand-maintained
 * `CATEGORY_ORDER` copies that used to live in `smart-scan-tab.tsx` and
 * `storage-tab.tsx` — two copies of one ordering is how a fifth member goes
 * missing from one tab. Asserted a permutation of `ScanCategorySchema.options`
 * in `category-palette.test.ts`.
 */
export const CATEGORY_ORDER: readonly ScanCategory[] = [
  'dependencies',
  'buildOutput',
  'toolCache',
  'staleWorktree',
  'looseObjects',
];

/**
 * The grouping axis's own ordering — `EcosystemSchema`'s own member order.
 * Asserted a permutation of `EcosystemSchema.options` in
 * `category-palette.test.ts`, so an ecosystem appended by a later phase
 * (Phase 73's `'go'`, Phase 74's `'media'`) cannot be forgotten here.
 */
export const ECOSYSTEM_ORDER: readonly Ecosystem[] = EcosystemSchema.options;

export const ECOSYSTEM_LABELS: Record<Ecosystem, string> = {
  node: 'Node',
  multi: 'Build tooling',
  rust: 'Rust',
  cpp: 'C / C++',
  dotnet: '.NET',
  python: 'Python',
  java: 'Java / Kotlin',
  swift: 'Swift / Xcode',
  ruby: 'Ruby',
  go: 'Go',
  git: 'Git',
};

/**
 * Eleven hues (one per `EcosystemSchema` member, `'go'` included — it landed
 * via Phase 73 onto this same enum), each ≥12° from every `CATEGORY_HUES` and
 * `METRIC_HUES` entry (asserted in `category-palette.test.ts`). Chosen by
 * scanning the hue circle for the gaps those two tables leave open, assigned
 * in `EcosystemSchema`'s own order — not by trying to match each tool's brand
 * colour, since the ordered bar's own legend and per-segment tooltip carry
 * the identification; the hue's only job is staying distinguishable from its
 * neighbours in that bar (Decision 3, amended by the x2 refinement).
 */
/** Exported for `category-palette.test.ts`'s hue-separation assertion. */
export const ECOSYSTEM_HUES: Record<Ecosystem, Hsl> = {
  node: [74, 60, 50],
  multi: [85, 60, 48],
  rust: [96, 55, 45],
  cpp: [138, 55, 45],
  dotnet: [180, 55, 48],
  python: [192, 55, 50],
  java: [232, 50, 58],
  swift: [246, 55, 58],
  ruby: [300, 60, 55],
  go: [315, 55, 55],
  git: [330, 60, 55],
};

export const ecosystemHsl = (ecosystem: Ecosystem): Hsl => ECOSYSTEM_HUES[ecosystem];

export const ecosystemColor = (ecosystem: Ecosystem): string => {
  const [h, s, l] = ecosystemHsl(ecosystem);
  return `hsl(${h} ${s}% ${l}%)`;
};

export const ecosystemFill = (ecosystem: Ecosystem, alpha: number): string => {
  const [h, s, l] = ecosystemHsl(ecosystem);
  return `hsl(${h} ${s}% ${l}% / ${alpha})`;
};
