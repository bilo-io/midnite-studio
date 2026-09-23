import { z } from 'zod';

/**
 * The one status vocabulary every "something is happening" surface in the
 * app renders through — Phase 95 Theme A.
 *
 * Before this, "is this element live" was six separate hardcoded maps (see
 * the phase doc's *Builds on* note) plus two bespoke CSS families
 * (`.agent-run-glow`, `.loop-run-glow`) that only ever painted the rainbow
 * ramp. Nine values cover both axes a caller actually needs: **who** is
 * responsible for the activity (`agent` a session is actively driving,
 * `shell` a plain terminal with none) and, when nobody is actively driving
 * it, **what state** the target itself is in (`thinking`/`waiting` — an
 * agent between turns or blocked on you — `running`/`queued`/`done`/`failed`
 * for a run's own lifecycle, `idle` for nothing at all). `useActivityGlow`
 * (Theme C) is what turns a target into exactly one of these; this file only
 * owns the vocabulary and how each value is painted.
 */
export const ActivityStatusSchema = z.enum([
  'agent',
  'shell',
  'thinking',
  'waiting',
  'running',
  'queued',
  'done',
  'failed',
  'idle',
]);
export type ActivityStatus = z.infer<typeof ActivityStatusSchema>;

/** Every {@link ActivityStatus} value, in the app's own display order. */
export const ACTIVITY_STATUSES = ActivityStatusSchema.options;

/**
 * A single flat colour — a CSS colour the browser can paint directly:
 * `#rrggbb`, or a theme-derived `hsl(var(--token))` (Decision, Brand preset:
 * "theme-derived solids elsewhere" in the phase doc). Not restricted to hex,
 * because the whole point of "theme-derived" is that it is NOT a fixed
 * value — it has to keep resolving through `--success`/`--destructive`/etc.
 * as the active theme and light/dark mode change, same as every other
 * `hsl(var(--token))` use in this codebase.
 */
export const ActivitySolidSchema = z.object({
  kind: z.literal('solid'),
  color: z.string().min(1).max(120),
});

/**
 * An ordered conic-gradient stop list — two or more CSS colours, evenly
 * spaced by the browser when listed with no explicit position (exactly how
 * `--rainbow-ramp` is already consumed by `.loop-run-glow`/`.agent-run-glow`).
 * A closed loop (`stops[0] === stops[stops.length - 1]`) reads as a full
 * rotation with no seam, which every built-in preset below does for its
 * `agent` ring — `shell`'s metallic ring does the same for the same reason.
 */
export const ActivityGradientSchema = z.object({
  kind: z.literal('gradient'),
  stops: z.array(z.string().min(1).max(120)).min(2),
});

export const ActivityColorSchema = z.discriminatedUnion('kind', [
  ActivitySolidSchema,
  ActivityGradientSchema,
]);
export type ActivityColor = z.infer<typeof ActivityColorSchema>;

/** How one status paints — its colour, the ring's full-rotation duration, and pulse strength. */
export const ActivityStatusStyleSchema = z.object({
  color: ActivityColorSchema,
  /** Seconds for one full `conic-gradient` rotation. Ignored by a solid colour, which never spins. */
  speed: z.number().positive().max(60).default(4),
  /** 0 = a steady ring, no pulse. 1 = the strongest `box-shadow` pulse a preset defines. */
  intensity: z.number().min(0).max(1).default(0.5),
});
export type ActivityStatusStyle = z.infer<typeof ActivityStatusStyleSchema>;

/**
 * A palette need not restate every status — `resolveActivityStatusStyle`
 * below falls back to the Brand preset for anything missing, the same
 * "never leave a caller with nothing to paint" rule `use-palette-sync.ts`
 * follows by clearing rather than stranding a token. A future per-status
 * override (Settings ▸ Activity, Theme B) is exactly this: a palette that
 * only sets the handful of statuses the user actually touched.
 */
/**
 * Hand-written rather than `z.record(ActivityStatusSchema, …)` — zod's
 * record output type mirrors TypeScript's `Record<K, V>`, which is
 * complete (every key required), the opposite of what this doc comment
 * promises. Nine explicit `.optional()` fields give both a runtime schema
 * that genuinely accepts a partial object and a TS type that matches.
 */
const ACTIVITY_PALETTE_STATUSES_SHAPE = Object.fromEntries(
  ActivityStatusSchema.options.map((status) => [status, ActivityStatusStyleSchema.optional()]),
) as Record<ActivityStatus, ReturnType<typeof ActivityStatusStyleSchema.optional>>;

export const ActivityPaletteSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  statuses: z.object(ACTIVITY_PALETTE_STATUSES_SHAPE),
});
export type ActivityPalette = z.infer<typeof ActivityPaletteSchema>;

const solid = (color: string, speed = 4, intensity = 0): ActivityStatusStyle => ({
  color: { kind: 'solid', color },
  speed,
  intensity,
});

const gradient = (stops: string[], speed = 4, intensity = 0.5): ActivityStatusStyle => ({
  color: { kind: 'gradient', stops },
  speed,
  intensity,
});

/**
 * The rotating metallic ring a plain shell wears — Decision (phase doc,
 * Theme A CSS bullet): a fixed silver sweep, not retinted per preset. A
 * terminal with no agent in it is chrome, not brand, in every preset —
 * `Settings ▸ Activity`'s "match agent" option (Theme B) is the opt-out for
 * a user who wants otherwise, not a fifth copy of this literal.
 */
const METAL_RING = ['#f5f5f5', '#9ca3af', '#e5e7eb', '#6b7280', '#f5f5f5'];

/**
 * The app's one amber literal — `waiting` in every preset below, plus the
 * pre-Theme-A duplicates this consolidates: `loop-glow.ts`'s
 * `LOOP_WAITING_COLOR`, `.loop-run-glow.is-waiting` and
 * `.agent-run-glow.is-waiting` in `styles.css` (those two stay literal —
 * CSS can't `import` a TS constant — but now read as "the same value as
 * this one" rather than "a fourth independent copy").
 */
export const ACTIVITY_WAITING_AMBER = '#f59e0b';

/**
 * The seven statuses every preset paints identically — Decision: only the
 * two *identity* rings (`agent`, and `thinking`'s "same hue, breathing"
 * variant of it) vary by preset. Flipping `failed` away from red because the
 * user picked Ocean would fight the universal severity colours every other
 * status pill in the app already uses (destructive is always red); a preset
 * is about brand identity, not remapping what red/green/amber mean.
 * `waiting` in particular keeps the app's one existing amber literal
 * (`#f59e0b` — `LOOP_WAITING_COLOR`, `.loop-run-glow.is-waiting`,
 * `.agent-run-glow.is-waiting`) rather than a theme token: there is no
 * `--warning` entry in `STUDIO_TOKENS` (`theme-types.ts`), and inventing one
 * is out of scope here.
 */
function semanticStatuses(agentStops: string[]): Partial<Record<ActivityStatus, ActivityStatusStyle>> {
  return {
    thinking: gradient(agentStops, 4, 0.35),
    waiting: solid(ACTIVITY_WAITING_AMBER, 4, 0),
    running: solid('hsl(var(--primary))', 4, 0.3),
    queued: solid('hsl(var(--muted-foreground))'),
    done: solid('hsl(var(--success))'),
    failed: solid('hsl(var(--destructive))'),
    idle: solid('transparent'),
  };
}

const BRAND_AGENT_STOPS = ['hsl(220 90% 55%)', 'hsl(263 70% 55%)', 'hsl(347 75% 55%)', 'hsl(220 90% 55%)'];
const RAINBOW_AGENT_STOPS = [
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
];
const OCEAN_AGENT_STOPS = ['#0ea5e9', '#06b6d4', '#22d3ee', '#0ea5e9'];
const EMBER_AGENT_STOPS = ['#f97316', '#ef4444', '#facc15', '#f97316'];
const MONO_AGENT_STOPS = ['#d4d4d8', '#71717a', '#27272a', '#d4d4d8'];

export const DEFAULT_ACTIVITY_PALETTE_ID = 'brand';

/**
 * The five built-in presets (phase doc: "recommend Ocean, Ember and Mono
 * beyond Brand and Rainbow; open to swap" — accepted as written, no
 * objection raised). **Brand** is the default: its `agent` ring approximates
 * `--brand-gradient`'s blue → violet → rose hue journey as three evenly-
 * spaced conic stops rather than importing that gradient verbatim — the
 * upstream token is a fixed-angle *linear* gradient with non-uniform stop
 * positions (0/28/62/100%) that does not drop cleanly into a conic ring.
 * **Rainbow** reproduces today's `--rainbow-ramp` byte-for-byte, which is
 * what makes it the reference preset for "did this change anything" — see
 * `activity-palette.test.ts`'s equivalence assertion.
 */
export const ACTIVITY_PRESETS: Record<string, ActivityPalette> = {
  brand: {
    id: 'brand',
    label: 'Brand',
    statuses: {
      agent: gradient(BRAND_AGENT_STOPS),
      shell: gradient(METAL_RING),
      ...semanticStatuses(BRAND_AGENT_STOPS),
    },
  },
  rainbow: {
    id: 'rainbow',
    label: 'Rainbow',
    statuses: {
      agent: gradient(RAINBOW_AGENT_STOPS),
      shell: gradient(METAL_RING),
      ...semanticStatuses(RAINBOW_AGENT_STOPS),
    },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    statuses: {
      agent: gradient(OCEAN_AGENT_STOPS),
      shell: gradient(METAL_RING),
      ...semanticStatuses(OCEAN_AGENT_STOPS),
    },
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    statuses: {
      agent: gradient(EMBER_AGENT_STOPS),
      shell: gradient(METAL_RING),
      ...semanticStatuses(EMBER_AGENT_STOPS),
    },
  },
  mono: {
    id: 'mono',
    label: 'Mono',
    statuses: {
      agent: gradient(MONO_AGENT_STOPS),
      shell: gradient(METAL_RING),
      ...semanticStatuses(MONO_AGENT_STOPS),
    },
  },
};

/** `ACTIVITY_PRESETS`, in the app's own display order (Settings ▸ Activity, Theme B). */
export const ACTIVITY_PRESET_ORDER = ['brand', 'rainbow', 'ocean', 'ember', 'mono'] as const;

/**
 * A status's resolved style — the given palette's own value, else the Brand
 * preset's (every built-in preset defines all nine, so this only matters for
 * a future user-edited palette that omits one, per `ActivityPaletteSchema`'s
 * own doc comment).
 */
export function resolveActivityStatusStyle(
  palette: ActivityPalette,
  status: ActivityStatus,
): ActivityStatusStyle {
  const brandFallback = ACTIVITY_PRESETS[DEFAULT_ACTIVITY_PALETTE_ID];
  const fallback = brandFallback?.statuses[status];
  const style = palette.statuses[status] ?? fallback;
  if (!style) {
    throw new Error(`activity-palette: no style for status "${status}" and no Brand fallback`);
  }
  return style;
}
