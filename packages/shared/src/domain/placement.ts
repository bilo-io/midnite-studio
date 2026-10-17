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

/**
 * Feature packages split out of one placement folder (Phase 113 Theme Q):
 * `media` is one folder whose tabs go to three apps, so it becomes several
 * packages — the shared shell every media app composes, and one package per
 * tab group that only its own app (and Studio) composes. Each entry names the
 * folder it came from and the apps that compose that package, owner first.
 * A package under `packages/features/` not listed here is named after its
 * folder and takes the folder's placement.
 */
export const FEATURE_PACKAGE_SPLITS = {
  'media-core': { folder: 'media', placement: ['creator', 'media', 'gamer'] },
  'media-docs': { folder: 'media', placement: 'creator' },
  'media-images': { folder: 'media', placement: 'creator' },
  'media-video': { folder: 'media', placement: 'creator' },
  'media-audio': { folder: 'media', placement: 'creator' },
  'media-map': { folder: 'media', placement: 'gamer' },
  'media-terrain': { folder: 'media', placement: 'gamer' },
  'media-sprite': { folder: 'media', placement: 'gamer' },
  'media-model': { folder: 'media', placement: 'gamer' },
  'media-game': { folder: 'media', placement: 'gamer' },
  // The MCP server's Tools view (Phase 113 Theme N): a package out of the `agent` folder, which the Agents app owns.
  'mcp-tools': { folder: 'agent', placement: 'agents' },
} as const satisfies Readonly<Record<string, { folder: PlacedFeature; placement: Placement }>>;

/**
 * Feature packages that hold more than one placement folder (Phase 113 Theme
 * O) — the other direction from {@link FEATURE_PACKAGE_SPLITS}. `forge` carries
 * the `forge`, `reviews` and `actions` folders, and `browser` the `browser` and
 * `web-apps` folders (Theme L): Reviews renders Actions' run
 * detail and both draw the forge's status vocabulary and query hooks, so split
 * per folder each would import another (docs/APPS.md, "Coder"). Every folder
 * listed keeps its own placement row and its own view registrations; the
 * package takes the placement of the folder it is named after.
 */
export const FEATURE_PACKAGE_FOLDERS = {
  forge: ['forge', 'reviews', 'actions'],
  // Phase 113 Theme L: the web-apps rail measures its native view with the pane's `boundsFromRect`, and
  // both ride the same `WebContentsView` services in main — split, `web-apps` would import `browser`.
  // The package takes `browser`'s frame placement; `web-apps` keeps its own row (the Browser app).
  browser: ['browser', 'web-apps'],
} as const satisfies Readonly<Record<string, readonly PlacedFeature[]>>;

/** The placement of the package `packages/features/<name>`, split or not; undefined for an unknown name. */
export function featurePackagePlacement(name: string): Placement | undefined {
  const split = (FEATURE_PACKAGE_SPLITS as Readonly<Record<string, { placement: Placement }>>)[name];
  return split ? split.placement : (FEATURE_PLACEMENT as Readonly<Record<string, Placement>>)[name];
}

/** The layer(s) that own a feature, owner first. */
export function placementOwners(placement: Placement): readonly PlacementLayer[] {
  return typeof placement === 'string' ? [placement] : placement;
}
