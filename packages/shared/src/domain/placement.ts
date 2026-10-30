import { z } from 'zod';

import { APP_MODULES, MODULE_HOST_IDS, RETIRED_APP_ALIASES, type ModuleHostId, type ModuleId, type RetiredAppId } from '../modules';

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
  'vanguard',
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
  report: 'frame', // Report an Issue: the dialog and its main half, in every app (packages/features/report)
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
  capture: 'capture',
  vanguard: 'vanguard',
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
  // Phase 113 Theme R: the Media app's local library — a tab, so it splits out of `media` like the others.
  'media-library': { folder: 'media', placement: 'media' },
  // The MCP server's Tools view (Phase 113 Theme N): a package out of the `agent` folder, which the Agents app owns.
  'mcp-tools': { folder: 'agent', placement: 'agents' },
  // Phase 119 Theme A: Midnite Git's engine. Coder owns it until Theme C gives the git app its own placement.
  'forge-host': { folder: 'forge', placement: 'coder' },
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

/**
 * Phase 124 Theme G: where a placement layer lives now that apps are lists of modules. A layer
 * names the module (or retired app) that owns a folder; the host apps are the apps whose module
 * list carries it, in `MODULE_HOST_IDS` order and without Studio (which carries everything).
 * `frame` is every app's, so it has no host of its own. `creator` is mounted in three.
 */
export function placementHosts(layer: PlacementLayer): readonly ModuleHostId[] {
  if (layer === 'frame') return [];
  return MODULE_HOST_IDS.filter((host) => host !== 'studio' && APP_MODULES[host].includes(layer as ModuleId));
}

/** The host app(s) of a folder: each owner's hosts, deduplicated, owner's first. */
export function placementHostApps(placement: Placement): readonly ModuleHostId[] {
  const hosts: ModuleHostId[] = [];
  for (const owner of placementOwners(placement)) {
    for (const host of placementHosts(owner)) if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

/** `FEATURE_PLACEMENT` re-expressed on host apps: `forge -> ['agents']`, `media -> ['agents', 'media', 'gamer']`. */
export const FEATURE_HOSTS: Readonly<Record<PlacedFeature, readonly ModuleHostId[]>> = Object.fromEntries(
  (Object.keys(FEATURE_PLACEMENT) as PlacedFeature[]).map((folder) => [folder, placementHostApps(FEATURE_PLACEMENT[folder])]),
) as Record<PlacedFeature, readonly ModuleHostId[]>;

/** The host an installed retired app counts as: Coder installed is Agents' work installed. */
export function retiredAppHost(app: string): ModuleHostId | undefined {
  return Object.hasOwn(RETIRED_APP_ALIASES, app) ? RETIRED_APP_ALIASES[app as RetiredAppId].app : undefined;
}
