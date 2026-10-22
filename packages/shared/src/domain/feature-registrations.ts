import type { PlacedFeature } from './placement';

/**
 * Phase 113 Theme C — every navigable id, declared by the feature that owns it.
 *
 * `VIEW_IDS` and `SETTINGS_PAGE_IDS` (`view.ts`) used to be two hand-ordered
 * literals that every view and settings page had to be added to. They are now
 * *composed*: each feature (one folder of the placement map, `placement.ts`)
 * registers the ids it contributes here, and an app composition picks which
 * features it wears and in what order. Studio composes every feature, in the
 * order below, into exactly the lists the literals held — the same ids in the
 * same order, so nothing persisted (`activeView`, `settingsPage`,
 * `navVisibility`, window roles, `midnite-studio://` links) changes. The test
 * beside this file pins both lists against the literals they replaced.
 *
 * **Why the ids live in `shared` and not in each feature package.** The ids
 * are wire contract: the main process validates deep links against them, the
 * MCP server publishes them as JSON-schema enums, and the companion's grammar
 * reads them — none of which may import a renderer feature. So the
 * registration (the id, and who owns it) is here, and a feature package's own
 * `manifest.ts` points back at its entry (`packages/features/optimizer/
 * manifest.ts` is the first, and its test asserts the two agree).
 *
 * `zod`-free and `const`-only, like the rest of `domain/`: this module is
 * imported by `view.ts`, which the launcher takes by source path.
 */

/** A feature's ids, in the order that feature contributes them. */
export type FeatureIds = readonly [string, ...string[]];

/**
 * The views each feature owns — one each today. Keyed by the placement map's
 * folder name (`api-client`, not `apiClient`), so a registration cannot name a
 * feature the placement map does not know.
 */
export const FEATURE_VIEWS = {
  landing: ['landing'],
  dashboard: ['dashboard'],
  notes: ['notes'],
  chats: ['chats'],
  sessions: ['sessions'],
  knowledge: ['knowledge'],
  files: ['files'],
  search: ['search'],
  optimizer: ['optimizer'],
  monitor: ['monitor'],
  vault: ['vault'],
  capture: ['capture'],
  vanguard: ['vanguard'],
  tests: ['tests'],
  database: ['database'],
  tasks: ['tasks'],
  graph: ['graph'],
  actions: ['actions'],
  reviews: ['reviews'],
  history: ['history'],
  councils: ['councils'],
  workflows: ['workflows'],
  media: ['media'],
  models: ['models'],
  'api-client': ['apiClient'],
  settings: ['settings'],
} as const satisfies Partial<Record<PlacedFeature, FeatureIds>>;

/**
 * The settings pages each feature owns. The page components themselves still
 * render inside the frame's Settings view; this records whose setting each
 * page is, which is what decides which app's Settings shows it once apps are
 * composed separately.
 *
 * A few owners deserve their reason:
 * - `graph` owns `gitSafety` — the force-push switch gates the graph's per-ref
 *   badge menu (`ref-sync.ts`), the only entry point it has.
 * - `optimizer` owns `trashSafety` — emptying the Trash is a Storage-tab
 *   action, over the `optimizerTrash*` channels.
 * - `agent` owns `mcp` — MCP tool management goes to the Agents app
 *   (Phase 113 Theme N).
 * - `settings` (the frame) owns `privacy` and `cli`: frame-wide policy and a
 *   runtime service, neither of which belongs to one app.
 */
export const FEATURE_SETTINGS_PAGES = {
  themes: ['appearance'],
  activity: ['activity'],
  settings: ['privacy', 'cli'],
  graph: ['graph', 'gitSafety'],
  diff: ['diff'],
  repos: ['sidebar'],
  search: ['search'],
  screensaver: ['screenLock'],
  terminal: ['terminal'],
  agent: ['agent', 'mcp'],
  reviews: ['reviews'],
  tasks: ['projects'],
  workflows: ['workflows'],
  media: ['media'],
  models: ['ollama'],
  optimizer: ['trashSafety', 'optimizer'],
  'api-client': ['apiClient'],
  monitor: ['monitor'],
  browser: ['browser'],
  version: ['updates'],
  diagnostics: ['health'],
  companion: ['companion'],
  'web-apps': ['web-apps'],
  forge: ['accounts'],
  vanguard: ['vanguard'],
} as const satisfies Partial<Record<PlacedFeature, FeatureIds>>;

type IdsOf<R> = R[keyof R] extends readonly (infer Id)[] ? Id : never;

/** Every registered view id — what `ViewId` is defined as. */
export type RegisteredViewId = IdsOf<typeof FEATURE_VIEWS>;
/** Every registered settings page id — what `SettingsPageId` is defined as. */
export type RegisteredSettingsPageId = IdsOf<typeof FEATURE_SETTINGS_PAGES>;

/**
 * Studio's rail order, as features. Every feature here owns exactly one view,
 * so this reads like the view list it produces.
 */
export const STUDIO_VIEW_ORDER = [
  'landing',
  'dashboard',
  'notes',
  'chats',
  'sessions',
  'knowledge',
  'files',
  'search',
  'optimizer',
  'monitor',
  'vault',
  'capture',
  'vanguard',
  'tests',
  'database',
  'tasks',
  'graph',
  'actions',
  'reviews',
  'history',
  'councils',
  'workflows',
  'media',
  'models',
  'api-client',
  'settings',
] as const satisfies readonly (keyof typeof FEATURE_VIEWS)[];

/**
 * Studio's settings-page id order, as features. A feature that owns more than
 * one page appears once per page: each mention takes that feature's NEXT page
 * (see {@link composeFeatureIds}). That is what lets a composition interleave
 * one feature's pages with another's — `agent`'s `agent` page sits tenth and
 * its `mcp` page twenty-fifth — without either feature knowing the other
 * exists.
 */
export const STUDIO_SETTINGS_PAGE_ORDER = [
  'themes',
  'activity',
  'settings',
  'graph',
  'diff',
  'repos',
  'search',
  'screensaver',
  'terminal',
  'agent',
  'reviews',
  'tasks',
  'workflows',
  'media',
  'models',
  'graph',
  'optimizer',
  'api-client',
  'monitor',
  'browser',
  'settings',
  'version',
  'diagnostics',
  'optimizer',
  'agent',
  'companion',
  'web-apps',
  'forge',
  'vanguard',
] as const satisfies readonly (keyof typeof FEATURE_SETTINGS_PAGES)[];

/**
 * Union features' registrations into one ordered id list.
 *
 * `order` is a list of feature mentions. Each mention takes the next id that
 * feature has not yet given up, so a feature mentioned once contributes its
 * first id, twice its first two, and so on. Mentioning a feature more often
 * than it has ids throws — that is a composition bug, and an id list missing a
 * slot would otherwise surface as a view that silently cannot be navigated to.
 *
 * Not asserted here: that every registered id was taken. An app that composes
 * a subset of features legitimately leaves the rest out, so completeness is a
 * per-composition test (Studio's is beside this file), not a runtime rule.
 */
export function composeFeatureIds<K extends string, Id extends string>(
  registrations: Readonly<Record<K, readonly Id[]>>,
  order: readonly K[],
): Id[] {
  const taken = new Map<K, number>();
  return order.map((feature) => {
    const next = taken.get(feature) ?? 0;
    const id = registrations[feature]?.[next];
    if (id === undefined) {
      throw new Error(`composeFeatureIds: ${feature} has no id #${next + 1} to contribute`);
    }
    taken.set(feature, next + 1);
    return id;
  });
}
