import { z } from 'zod';

/**
 * The Phase 113 placement map — which layer owns each renderer feature folder.
 * `docs/APPS.md` is the prose; this const is its machine-readable twin, and
 * two vitests keep all three honest (`packages/app/src/placement.test.ts`):
 * every folder in `packages/app/src/features/` must be named here, nothing
 * here may name a folder that is gone, and every row of the doc's table must
 * agree with this file.
 *
 * Vocabulary (see the doc): the **runtime** is the headless main-process
 * services no window owns; the **frame** is the renderer chrome every app
 * wears — never "shell", which is `@bilo-io/shell`'s name; an **app** owns one
 * area of work; a **feature** is one folder of `features/`. The rule: the
 * frame holds tools every app wants, an app owns one area of work.
 *
 * `zod` only, following the rest of `domain/`.
 */
export const PlacementAppIdSchema = z.enum([
  'cleaner',
  'monitor',
  'vault',
  'capture',
  'browser',
  'mind',
  'agents',
  'coder',
  'money',
  'creator',
  'media',
  'gamer',
]);
export type PlacementAppId = z.infer<typeof PlacementAppIdSchema>;

/** Every app, in the launcher's order (the doc's table numbers them 1-12). */
export const PLACEMENT_APP_IDS = PlacementAppIdSchema.options;

/** A feature lives in the frame or in an app. */
export const PlacementLayerSchema = z.union([z.literal('frame'), PlacementAppIdSchema]);
export type PlacementLayer = z.infer<typeof PlacementLayerSchema>;

/**
 * One folder's placement. A string is a single owner. A tuple is a folder
 * several apps compose (today only `media`, whose tabs split across Creator,
 * Media and Gamer): the first entry is the owner, the rest reuse it.
 */
export type Placement = PlacementLayer | readonly [PlacementAppId, ...PlacementAppId[]];

export const FEATURE_PLACEMENT = {
  // Frame: tools every app wants.
  activity: 'frame',
  battery: 'frame',
  browser: 'frame', // the panel; the Browser app composes it, and `web-apps` is its own folder
  changes: 'frame',
  commit: 'frame',
  companion: 'frame',
  conflicts: 'frame',
  dashboard: 'frame',
  diff: 'frame',
  empty: 'frame',
  files: 'frame',
  geo: 'frame',
  graph: 'frame',
  history: 'frame',
  knowledge: 'frame',
  landing: 'frame',
  loops: 'frame',
  markdown: 'frame',
  palette: 'frame',
  'quick-access': 'frame',
  rebase: 'frame',
  repos: 'frame',
  screensaver: 'frame',
  search: 'frame',
  settings: 'frame',
  setup: 'frame',
  stash: 'frame',
  status: 'frame',
  'status-bar': 'frame',
  terminal: 'frame',
  themes: 'frame',
  'titlebar-status': 'frame',
  version: 'frame',
  weather: 'frame',

  // Apps: each owns one area of work.
  optimizer: 'cleaner',
  monitor: 'monitor',
  diagnostics: 'monitor',
  vault: 'vault',
  'web-apps': 'browser',
  notes: 'mind',
  agent: 'agents',
  automate: 'agents',
  chats: 'agents',
  councils: 'agents',
  models: 'agents',
  workflows: 'agents',
  actions: 'coder',
  'api-client': 'coder',
  database: 'coder',
  forge: 'coder',
  reviews: 'coder',
  sessions: 'coder',
  tasks: 'coder',
  tests: 'coder',
  finance: 'money',
  slides: 'creator',
  media: ['creator', 'media', 'gamer'],
} as const satisfies Readonly<Record<string, Placement>>;

export type PlacedFeature = keyof typeof FEATURE_PLACEMENT;

/** The layer(s) that own a feature, owner first. */
export function placementOwners(placement: Placement): readonly PlacementLayer[] {
  return typeof placement === 'string' ? [placement] : placement;
}
