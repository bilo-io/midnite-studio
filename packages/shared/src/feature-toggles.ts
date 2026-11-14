import { z } from 'zod';

import type { SettingsPageId, ViewId } from './domain/view';
import type { CommandId } from './keybindings';

/**
 * Feature toggles (Phase 135): which of Studio's features the user has switched off in Settings ▸ Features.
 *
 * One table. A toggle is a user-facing feature that covers one or more feature packages (`packages` — the
 * names in `apps/studio`'s `STUDIO_FEATURES`); every composed package is either covered by exactly one toggle
 * or listed in {@link ALWAYS_ON_FEATURE_PACKAGES} with its reason, and `apps/studio/src/feature-toggles.test.ts`
 * fails otherwise. What "off" hides (views, settings pages, commands) and what "Delete this feature's data"
 * removes (`data`) are read from here by the renderer and main alike.
 *
 * Terminal, Settings and Accounts are always on: Settings is the frame and Accounts a settings page no toggle
 * claims, and Terminal's package is always-on below.
 */

/** Where a toggle sits on the Features page: the rail's groups, plus the panels and tools with no rail row. */
export type FeatureToggleGroup = 'pinned' | 'workspace' | 'git' | 'agent' | 'panels';

export const FEATURE_TOGGLE_GROUPS: readonly { id: FeatureToggleGroup; label: string }[] = [
  { id: 'pinned', label: 'Pinned' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'git', label: 'Git' },
  { id: 'agent', label: 'Agents' },
  { id: 'panels', label: 'Panels and tools' },
];

/** What a feature keeps on disk and in the renderer — what "Delete this feature's data" removes. */
export type FeatureDataLocations = {
  /** Files or directories relative to Electron's `userData`. Moved to the Trash. */
  files: readonly string[];
  /** Renderer `localStorage` keys (zustand `persist` names) owned by the feature alone. */
  storeKeys: readonly string[];
  /** Vault entries owned by the feature alone, as `<namespace>:<key prefix>`. Removed outright. */
  vault: readonly string[];
};

export type FeatureToggleSpec = {
  label: string;
  /** One line for the Features page. */
  description: string;
  group: FeatureToggleGroup;
  /** Features this one needs on. Turning this on turns them on; turning one of them off turns this off. */
  requires: readonly string[];
  /** The `STUDIO_FEATURES` packages this toggle covers. */
  packages: readonly string[];
  views: readonly ViewId[];
  settingsPages: readonly SettingsPageId[];
  commands: readonly CommandId[];
  data: FeatureDataLocations;
  /** Set when some of its main-process work only stops on relaunch: the page says "takes effect after restart". */
  restart?: true;
  /**
   * Set when its IPC must stay open while it is off, with why: an always-on surface (Accounts, the git graph,
   * Settings ▸ Agent) calls the same channels. Main's gate then answers them as usual.
   */
  ipcOpen?: string;
};

const NO_DATA: FeatureDataLocations = { files: [], storeKeys: [], vault: [] };

const MEDIA_PACKAGES = [
  'media-core',
  'media-docs',
  'media-images',
  'media-library',
  'media-audio',
  'media-video',
  'media-map',
  'media-terrain',
  'media-sprite',
  'media-model',
  'media-game',
] as const;

const BROWSER_COMMANDS = [
  'browser.toggle',
  'browser.openDevServer',
  'browser.newTab',
  'browser.closeTab',
  'browser.nextTab',
  'browser.prevTab',
  'browser.reopenTab',
  'browser.find',
  'browser.zoomIn',
  'browser.zoomOut',
  'browser.zoomReset',
  'browser.devtools',
  'browser.clearData',
  'browser.selectTab1',
  'browser.selectTab2',
  'browser.selectTab3',
  'browser.selectTab4',
  'browser.selectTab5',
  'browser.selectTab6',
  'browser.selectTab7',
  'browser.selectTab8',
  'browser.selectTab9',
  'window.detachBrowser',
] as const satisfies readonly CommandId[];

export const FEATURE_TOGGLES = {
  books: {
    label: 'Books',
    description: 'Double-entry bookkeeping: accounts, journals and reports.',
    group: 'pinned',
    requires: [],
    packages: ['ledger'],
    views: ['books'],
    settingsPages: [],
    commands: [],
    data: { files: [], storeKeys: ['midnite-studio.ledger-ui'], vault: [] },
  },
  notes: {
    label: 'Notes',
    description: 'Markdown notes, the Notes panel and quick capture.',
    group: 'pinned',
    requires: [],
    packages: ['notes'],
    views: ['notes'],
    settingsPages: [],
    commands: ['notes.toggle'],
    data: { files: ['notes', 'notes-review'], storeKeys: [], vault: [] },
  },
  chats: {
    label: 'Chats',
    description: 'Conversations with an agent, with change review.',
    group: 'pinned',
    requires: [],
    packages: ['chats'],
    views: ['chats'],
    settingsPages: [],
    commands: ['view.chats'],
    data: { files: ['chats'], storeKeys: ['midnite.chats.composer'], vault: [] },
  },
  sessions: {
    label: 'Sessions',
    description: 'Every terminal and agent session, live and archived.',
    group: 'pinned',
    requires: [],
    packages: ['sessions'],
    views: ['sessions'],
    settingsPages: [],
    commands: [],
    data: NO_DATA,
    ipcOpen: 'Its two channels list and replay terminals, which the always-on Terminal uses too.',
  },
  optimizer: {
    label: 'Workspace Optimizer',
    description: 'Finds build caches and stale dependencies to clean.',
    group: 'workspace',
    requires: [],
    packages: ['optimizer'],
    views: ['optimizer'],
    settingsPages: ['trashSafety', 'optimizer'],
    commands: [],
    data: NO_DATA,
  },
  monitor: {
    label: 'Monitor',
    description: 'CPU, memory and agent usage over time.',
    group: 'workspace',
    requires: [],
    packages: ['monitor'],
    views: ['monitor'],
    settingsPages: ['monitor'],
    commands: [],
    data: NO_DATA,
  },
  vault: {
    label: 'Vault',
    description: 'A view of every stored secret, login and sign-in (the secrets themselves stay).',
    group: 'workspace',
    requires: [],
    packages: ['vault'],
    views: ['vault'],
    settingsPages: [],
    commands: [],
    data: NO_DATA,
    ipcOpen: 'Settings ▸ Accounts and ▸ Agent store and list credentials through the same channels.',
  },
  capture: {
    label: 'Capture',
    description: 'Screenshots, region grabs, recordings and clipboard history.',
    group: 'workspace',
    requires: [],
    packages: ['capture'],
    views: ['capture'],
    settingsPages: [],
    commands: [],
    data: { files: ['capture'], storeKeys: [], vault: [] },
  },
  vanguard: {
    label: 'Vanguard',
    description: 'Security findings, sensors and network watch.',
    group: 'workspace',
    requires: [],
    packages: ['vanguard'],
    views: ['vanguard'],
    settingsPages: ['vanguard'],
    commands: [],
    data: { files: ['vanguard.json', 'baselines'], storeKeys: [], vault: [] },
  },
  tests: {
    label: 'Tests',
    description: "Discover and run a repository's test suites.",
    group: 'workspace',
    requires: [],
    packages: ['tests'],
    views: ['tests'],
    settingsPages: [],
    commands: [],
    data: { files: ['tests-trust.json'], storeKeys: [], vault: [] },
  },
  database: {
    label: 'Database',
    description: 'Connect to databases, browse tables and run queries.',
    group: 'workspace',
    requires: [],
    packages: ['database'],
    views: ['database'],
    settingsPages: [],
    commands: [],
    data: { files: ['db-connections.json'], storeKeys: [], vault: [] },
  },
  'api-client': {
    label: 'API Client',
    description: 'Send HTTP requests and keep collections.',
    group: 'workspace',
    requires: [],
    packages: ['api-client'],
    views: ['apiClient'],
    settingsPages: ['apiClient'],
    commands: ['view.apiClient'],
    data: NO_DATA,
  },
  tasks: {
    label: 'Tasks',
    description: 'Project boards, issues and agent-run cards.',
    group: 'git',
    requires: ['forge'],
    packages: ['tasks'],
    views: ['tasks'],
    settingsPages: ['projects'],
    commands: ['view.issues'],
    data: NO_DATA,
  },
  forge: {
    label: 'Pull requests and Actions',
    description: 'Reviews, checks and workflow runs from your forge (Accounts stay).',
    group: 'git',
    requires: [],
    packages: ['forge'],
    views: ['reviews', 'actions'],
    settingsPages: ['reviews'],
    commands: [],
    data: { files: ['gitlab-languages.json'], storeKeys: [], vault: [] },
    ipcOpen: "Accounts and the git graph's pull-request and CI badges use the same forge channels.",
  },
  councils: {
    label: 'Councils',
    description: 'Several agents answer one question; a synthesizer reconciles them.',
    group: 'agent',
    requires: ['chats'],
    packages: ['councils'],
    views: ['councils'],
    settingsPages: [],
    commands: [],
    data: { files: ['councils.json', 'council-runs.json'], storeKeys: [], vault: [] },
  },
  workflows: {
    label: 'Workflows',
    description: 'Graphs of agent and tool steps, with triggers.',
    group: 'agent',
    requires: [],
    packages: ['workflows'],
    views: ['workflows'],
    settingsPages: ['workflows'],
    commands: ['workflow.run'],
    data: { files: ['workflows.json', 'workflow-templates.json', 'workflow-runs.json'], storeKeys: [], vault: [] },
  },
  media: {
    label: 'Media',
    description: 'Docs, images, audio, video, maps, terrain, sprites, 3D models and games.',
    group: 'agent',
    requires: [],
    packages: MEDIA_PACKAGES,
    views: ['media'],
    settingsPages: ['media'],
    commands: [
      'view.media',
      'view.video',
      'media.tab.doc',
      'media.tab.image',
      'media.tab.video',
      'media.tab.audio',
      'media.tab.model',
      'media.audio.editor',
      'media.audio.generator',
    ],
    data: { files: ['animation-library', 'sf3d', 'sfx', 'audio-models', 'games-settings.json', 'video-settings.json', 'map-settings.json'], storeKeys: ['mstudio.media.audio-prefs', 'mstudio.media.image-prefs', 'mstudio.media.model-prefs', 'midnite-studio.game-juice', 'midnite-studio.level-view'], vault: [] },
  },
  models: {
    label: 'Models',
    description: 'Local Ollama models: pull, run and configure.',
    group: 'agent',
    requires: [],
    packages: ['models'],
    views: ['models'],
    settingsPages: ['ollama'],
    commands: ['view.models'],
    data: { files: ['ollama-settings.json', 'ollama-digests.json'], storeKeys: [], vault: [] },
  },
  browser: {
    label: 'Browser',
    description: 'The browser panel and the web apps rail.',
    group: 'panels',
    requires: [],
    packages: ['browser'],
    views: [],
    settingsPages: ['browser', 'web-apps'],
    commands: BROWSER_COMMANDS,
    data: { files: ['browser-hosts-seen.json', 'browser-tracker-exceptions.json', 'browser-permissions.json', 'downloads.ndjson'], storeKeys: ['midnite-studio.browser'], vault: [] },
  },
  companion: {
    label: 'Companion',
    description: 'The voice companion panel.',
    group: 'panels',
    requires: [],
    packages: ['companion'],
    views: [],
    settingsPages: ['companion'],
    commands: ['companion.toggle', 'window.detachCompanion'],
    data: { files: ['companion.json', 'companion-stt.vault.json'], storeKeys: ['midnite-studio.companion'], vault: [] },
  },
  loops: {
    label: 'Loops',
    description: 'The quick-access menu and recurring agent loops.',
    group: 'panels',
    requires: [],
    packages: ['loops'],
    views: [],
    settingsPages: [],
    commands: ['fab.toggle', 'window.detachFab'],
    data: NO_DATA,
  },
  finance: {
    label: 'Finance',
    description: 'Portfolio panel, status-bar ticker and dashboard widgets.',
    group: 'panels',
    requires: [],
    packages: ['finance'],
    views: [],
    settingsPages: [],
    commands: [],
    data: { files: ['finance'], storeKeys: ['midnite-studio.finance-ui'], vault: [] },
  },
  slides: {
    label: 'Slides',
    description: 'Present a Markdown file as slides.',
    group: 'panels',
    requires: [],
    packages: ['slides'],
    views: [],
    settingsPages: [],
    commands: ['markdown.presentAsSlides'],
    data: NO_DATA,
  },
  report: {
    label: 'Report an Issue',
    description: 'File a bug with logs and a screenshot attached.',
    group: 'panels',
    requires: [],
    packages: ['report'],
    views: [],
    settingsPages: [],
    commands: ['app.reportIssue'],
    data: NO_DATA,
  },
} as const satisfies Record<string, FeatureToggleSpec>;

export type FeatureToggleId = keyof typeof FEATURE_TOGGLES;
export const FEATURE_TOGGLE_IDS = Object.keys(FEATURE_TOGGLES) as FeatureToggleId[];

/** A toggle's spec, widened — the table's literal types are for `FeatureToggleId`, not for callers. */
export function featureToggle(id: FeatureToggleId): FeatureToggleSpec {
  return FEATURE_TOGGLES[id];
}

/** The composed packages no toggle covers, each with why it stays on. */
export const ALWAYS_ON_FEATURE_PACKAGES = {
  terminal: 'Terminal is always on: every agent, session and the companion run in it.',
  'forge-host': 'The git engine behind the graph and the forge; Accounts and the git client need it.',
  'mcp-tools': "The midnite MCP server's trust, approvals and audit, which every agent's tool calls go through.",
} as const satisfies Record<string, string>;

export function isFeatureToggleId(value: unknown): value is FeatureToggleId {
  return typeof value === 'string' && Object.hasOwn(FEATURE_TOGGLES, value);
}

// ── persisted state ─────────────────────────────────────────────────────────────

/**
 * The `studioFeatures` suite-prefs group: which toggles are off. Sparse, so a feature added later is on by
 * default; an id that no longer exists is dropped rather than failing the group.
 */
export const StudioFeaturesPrefsSchema = z.object({
  disabled: z
    .array(z.string())
    .default([])
    .transform((ids) => [...new Set(ids.filter(isFeatureToggleId))]),
});
export type StudioFeaturesPrefs = z.infer<typeof StudioFeaturesPrefsSchema>;

// ── lookups ─────────────────────────────────────────────────────────────────────

function ownerMap<K extends string>(pick: (spec: FeatureToggleSpec) => readonly K[]): ReadonlyMap<K, FeatureToggleId> {
  const map = new Map<K, FeatureToggleId>();
  for (const id of FEATURE_TOGGLE_IDS) for (const key of pick(featureToggle(id))) map.set(key, id);
  return map;
}

const VIEW_OWNER = ownerMap((spec) => spec.views);
const PAGE_OWNER = ownerMap((spec) => spec.settingsPages);
const COMMAND_OWNER = ownerMap((spec) => spec.commands);
const PACKAGE_OWNER = ownerMap((spec) => spec.packages);

export const featureForView = (view: ViewId): FeatureToggleId | undefined => VIEW_OWNER.get(view);
export const featureForSettingsPage = (page: SettingsPageId): FeatureToggleId | undefined => PAGE_OWNER.get(page);
export const featureForCommand = (command: CommandId): FeatureToggleId | undefined => COMMAND_OWNER.get(command);
export const featureForPackage = (pkg: string): FeatureToggleId | undefined => PACKAGE_OWNER.get(pkg);

export type DisabledFeatures = readonly FeatureToggleId[];

export function isFeatureOn(disabled: DisabledFeatures, id: FeatureToggleId): boolean {
  return !disabled.includes(id);
}

/** Whether something owned by a toggle is off. Unowned (frame) things are never off. */
function ownedOff(disabled: DisabledFeatures, owner: FeatureToggleId | undefined): boolean {
  return owner !== undefined && disabled.includes(owner);
}

export const isViewOff = (disabled: DisabledFeatures, view: ViewId) => ownedOff(disabled, featureForView(view));
export const isSettingsPageOff = (disabled: DisabledFeatures, page: SettingsPageId) =>
  ownedOff(disabled, featureForSettingsPage(page));
export const isCommandOff = (disabled: DisabledFeatures, command: CommandId) =>
  ownedOff(disabled, featureForCommand(command));

/** Every view a switched-off feature owns. */
export function disabledViews(disabled: DisabledFeatures): ViewId[] {
  return disabled.flatMap((id) => featureToggle(id).views);
}

/** The reason a switched-off feature's command shows in the palette and menus. */
export const FEATURE_OFF_REASON = 'Switched off in Settings ▸ Features';

// ── dependencies ────────────────────────────────────────────────────────────────

/** `id` and everything it needs, transitively. */
export function requirementsOf(id: FeatureToggleId): FeatureToggleId[] {
  const out: FeatureToggleId[] = [];
  const visit = (next: FeatureToggleId) => {
    if (out.includes(next)) return;
    out.push(next);
    for (const req of featureToggle(next).requires) if (isFeatureToggleId(req)) visit(req);
  };
  visit(id);
  return out;
}

/** Every feature that needs `id`, transitively — what switching `id` off switches off too. */
export function dependentsOf(id: FeatureToggleId): FeatureToggleId[] {
  return FEATURE_TOGGLE_IDS.filter((other) => other !== id && requirementsOf(other).includes(id));
}

/**
 * The disabled list after switching `id` on or off: on also turns on what it needs; off also turns off what
 * needs it. The order of the result follows the table, so a write is stable.
 */
export function setFeatureEnabled(disabled: DisabledFeatures, id: FeatureToggleId, on: boolean): FeatureToggleId[] {
  const next = new Set(disabled);
  if (on) for (const req of requirementsOf(id)) next.delete(req);
  else for (const off of [id, ...dependentsOf(id)]) next.add(off);
  return FEATURE_TOGGLE_IDS.filter((t) => next.has(t));
}
