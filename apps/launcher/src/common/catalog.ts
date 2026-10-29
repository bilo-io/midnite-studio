// Type-only, by source path: erased at build, so neither bundle pulls `shared`'s zod.
import type { ViewId } from '@midnite/studio-shared/domain/view';
import type { MediaTab } from '@midnite/studio-shared/media';
import type { ModuleId } from '@midnite/studio-shared/modules';
import type { VanguardTab } from '@midnite/studio-shared/vanguard';

/**
 * The Midnite app suite, as the launcher lists it.
 *
 * Each entry is the app as it is *meant* to ship: its own name, colour, pitch
 * and vision. **Today every one of them runs inside Midnite Studio** — the
 * suite has not been split yet — so each feature names the Studio view it lives
 * in now, and opening an app opens Studio there. When an app ships on its own,
 * its `runsIn` changes and the launcher installs that bundle instead; nothing
 * about the tile has to move.
 *
 * Pure data, imported by main (to turn an id into a link — the renderer never
 * hands main a URL) and by the renderer (to draw the tiles).
 */

/** Where in Studio a feature (or an app's front door) lands. */
export type StudioTarget =
  | { kind: 'view'; view: ViewId; tab?: MediaTab | VanguardTab }
  /** Studio's browser panel, opened on a page. */
  | { kind: 'browser'; url: string };

export type AppFeature = {
  id: string;
  label: string;
  blurb: string;
  target: StudioTarget;
};

export type AppSection = 'suite' | 'utilities';

export const SECTION_LABELS: Record<AppSection, string> = {
  suite: 'Midnite Apps',
  utilities: 'Utilities',
};

/**
 * Phase 124 Theme F: one section. `'utilities'` stays in the type for later use, but nothing is
 * placed there — Cleaner, Vault, Monitor and Capture are modules of Vanguard and Mind now.
 */
export const SECTION_ORDER: readonly AppSection[] = ['suite'];

/**
 * One composable slice of an app (Phase 124): a feature or two plus the view they open on. An
 * app lists the modules it hosts, its own first; an absorbed app (Coder, Vault, ...) is a module
 * here, carrying the tagline and vision it had as an app. The module's glyph is a component, so
 * it lives beside the app glyphs in the renderer (`MODULE_GLYPHS`), not in this pure data.
 */
export type LauncherModule = {
  id: ModuleId;
  name: string;
  tagline: string;
  /** Present on an absorbed app's module — its old vision, folded in. A host's own module has none. */
  vision?: string;
  /** Where opening the module on its own lands. */
  home: StudioTarget;
  features: readonly AppFeature[];
  /** Listed, but cannot be opened yet. */
  comingSoon?: boolean;
};

export type LauncherApp = {
  id: AppId;
  /** The second half of the wordmark: Midnite **Coder**. */
  name: string;
  section: AppSection;
  /** A hex accent — the number chip and the coloured half of the wordmark. */
  accent: string;
  /**
   * `'brand'` wears the midnite brand gradient (blue → violet → a touch of
   * pink) instead of its accent — on the logo, the number chip and the
   * wordmark. Studio only: it is the whole brand, not one app in it.
   */
  gradient?: 'brand';
  /** One line under the name. */
  tagline: string;
  /** The tools it stands beside, for orientation — never a claim of parity. */
  like: string;
  /** Two or three sentences: what the app is for once it stands on its own. */
  vision: string;
  /** Where "Open" lands when no feature is picked. */
  home: StudioTarget;
  /** The modules this app hosts, its own first. Empty for an app with none yet (Startup, Health). */
  modules: readonly LauncherModule[];
  /** Every module's features, flattened in module order (an app with no modules lists its own). */
  features: readonly AppFeature[];
  /** Which installed product carries it today. Every app is `studio` for now. */
  runsIn: 'studio';
  /** When true, the app is listed as coming soon and cannot be installed or opened yet. */
  comingSoon?: boolean;
};

export const APP_IDS = [
  'studio',
  'agents',
  'gamer',
  'media',
  'money',
  'mind',
  'browser',
  'science',
  'vanguard',
  'startup',
  'health',
] as const;
export type AppId = (typeof APP_IDS)[number];

/**
 * Apps Phase 124 merged into a host but whose bundles are still built and installable until
 * Theme H deletes them. Only the bundle code (`main/bundles/`) keys on these — no tile, link or
 * IPC id does. A test holds this list to `RETIRED_APP_IDS` in shared (minus the two that never
 * shipped a bundle: Accountant and Simulator).
 */
export const LEGACY_BUNDLE_APP_IDS = ['coder', 'creator', 'cleaner', 'vault', 'monitor', 'capture'] as const;
export type LegacyBundleAppId = (typeof LEGACY_BUNDLE_APP_IDS)[number];

/** Every id an installed bundle can carry: the catalog's apps plus the retired ones still built. */
export const BUNDLE_APP_IDS = [...APP_IDS, ...LEGACY_BUNDLE_APP_IDS] as const;
export type BundleAppId = AppId | LegacyBundleAppId;

/** Every app Phase 124 merged into a host — the old ids a link or a placement can still carry. */
export type RetiredLauncherAppId = LegacyBundleAppId | 'accountant' | 'simulator';

/**
 * Where a retired id lands now: its host app and the module that opens on it. Mirrors
 * `RETIRED_APP_ALIASES` in `shared/src/modules.ts` (a test holds the two together); copied here
 * because the launcher takes `shared` by type only. Theme G rewires links and placement properly.
 */
export const LEGACY_APP_HOSTS: Record<RetiredLauncherAppId, { app: AppId; module: ModuleId }> = {
  coder: { app: 'agents', module: 'coder' },
  creator: { app: 'agents', module: 'creator' },
  vault: { app: 'vanguard', module: 'vault' },
  cleaner: { app: 'vanguard', module: 'cleaner' },
  monitor: { app: 'vanguard', module: 'monitor' },
  capture: { app: 'mind', module: 'capture' },
  accountant: { app: 'money', module: 'accountant' },
  simulator: { app: 'science', module: 'simulator' },
};

/** The tile an id belongs to: itself, or the host of the app it was merged into. `null` for anything else. */
export function tileIdFor(id: string): AppId | null {
  if ((APP_IDS as readonly string[]).includes(id)) return id as AppId;
  return Object.hasOwn(LEGACY_APP_HOSTS, id) ? LEGACY_APP_HOSTS[id as RetiredLauncherAppId].app : null;
}

/** The name a retired bundle's stub is called (`Midnite Cleaner`). */
export const LEGACY_BUNDLE_NAMES: Record<LegacyBundleAppId, string> = {
  coder: 'Coder',
  creator: 'Creator',
  cleaner: 'Cleaner',
  vault: 'Vault',
  monitor: 'Monitor',
  capture: 'Capture',
};

const view = (v: ViewId, tab?: MediaTab | VanguardTab): StudioTarget =>
  tab === undefined ? { kind: 'view', view: v } : { kind: 'view', view: v, tab };

/**
 * The frame every midnite app is built on — present in each of them, never an
 * app of its own. Listed once here so the detail sheet can say so.
 */
export const FRAME_PARTS: readonly { label: string; blurb: string }[] = [
  { label: 'Layout', blurb: 'Title bar with breadcrumbs, nav rail, status bar' },
  { label: 'Terminal', blurb: 'Integrated terminals that survive restarts' },
  { label: 'Companion', blurb: 'The voice-and-chat assistant docked on the right' },
  { label: 'Loops', blurb: 'Recurring agent runs, on a schedule' },
  { label: 'Browser', blurb: 'An embedded browser panel' },
  { label: 'Explorer', blurb: 'Files, search and the workspace tree' },
  { label: 'Git Graph', blurb: 'The commit graph, for any repo you open' },
  { label: 'Knowledge', blurb: 'The graph linking code, notes and conversations' },
];

/**
 * The modules, each defined once: a host lists the ones it mounts, so Creator is the same entry in
 * Agents, Media and Gamer. The absorbed apps (Coder ... Simulator) carry their old tagline and
 * vision here; a host's own module leaves `vision` to the app. Matches `APP_MODULES` in
 * `shared/src/modules.ts` (a test holds the two together).
 */
const MODULES = {
  agents: {
    id: 'agents',
    name: 'Agents',
    tagline: 'Chats, councils, graphs and local models',
    home: view('chats'),
    features: [
      { id: 'chats', label: 'Chats', blurb: 'Agent-CLI conversations with reviewable changes', target: view('chats') },
      { id: 'councils', label: 'Councils', blurb: 'Several agents on one question, one synthesis', target: view('councils') },
      { id: 'graphs', label: 'Graphs', blurb: 'Agent workflows as runnable graphs', target: view('workflows') },
      { id: 'models', label: 'Models', blurb: 'Local models, run on your own machine', target: view('models') },
      { id: 'tools', label: 'Tools (MCP)', blurb: 'MCP servers your agents can call', target: view('settings') },
    ],
  },
  coder: {
    id: 'coder',
    name: 'Coder',
    tagline: 'Sessions, tasks, forge, APIs and databases',
    vision:
      'The loop around a repository in one window: agent sessions working in worktrees, the tasks they pick up, the forge — pull requests, checks, reviews — beside the graph they change, and the API and database you are building against one tab away.',
    home: view('sessions'),
    features: [
      { id: 'sessions', label: 'Sessions', blurb: 'Agent sessions across your worktrees', target: view('sessions') },
      { id: 'tasks', label: 'Tasks', blurb: 'Boards, issues and what is next', target: view('tasks') },
      { id: 'forge', label: 'Git Forge', blurb: 'Pull requests, checks and reviews', target: view('reviews') },
      { id: 'api', label: 'API Explorer', blurb: 'Requests, collections and environments', target: view('apiClient') },
      { id: 'db', label: 'DB Explorer', blurb: 'Browse and query your databases', target: view('database') },
    ],
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    tagline: 'Docs, images, audio and video',
    vision:
      'Write, generate and edit in one studio: long-form docs, image generation, music and voice, and video cut from an editorial script — every asset a file in your project rather than a row in someone else’s cloud.',
    home: view('media', 'doc'),
    features: [
      { id: 'docs', label: 'Docs', blurb: 'Markdown documents with threads', target: view('media', 'doc') },
      { id: 'images', label: 'Images', blurb: 'Prompts, providers and variations', target: view('media', 'image') },
      { id: 'audio', label: 'Audio', blurb: 'Songs, loops and soundtracks', target: view('media', 'audio') },
      { id: 'video', label: 'Video', blurb: 'Editorial scripts into cuts', target: view('media', 'video') },
    ],
  },
  media: {
    id: 'media',
    name: 'Media',
    tagline: 'Your own media server — films, shows, music and photos',
    // Every leaf lands on Media ▸ Library (Phase 113 Theme R), which holds all four kinds under one tab.
    home: view('media', 'library'),
    features: [
      { id: 'library', label: 'Movies & Shows', blurb: 'A browsable library with progress', target: view('media', 'library') },
      { id: 'music', label: 'Music', blurb: 'Albums, artists and playlists', target: view('media', 'library') },
      { id: 'photos', label: 'Photos', blurb: 'Albums from your folders', target: view('media', 'library') },
    ],
  },
  gamer: {
    id: 'gamer',
    name: 'Gamer',
    tagline: 'Maps, terrains, models, sprites and games',
    home: view('media', 'game'),
    features: [
      { id: 'maps', label: 'Maps', blurb: 'Real places, measured and captured', target: view('media', 'map') },
      { id: 'terrains', label: 'Terrains', blurb: 'Heightmaps into game-ready landscapes', target: view('media', 'terrain') },
      { id: 'models', label: '3D Models', blurb: 'Spec, render, look, patch', target: view('media', 'model') },
      { id: 'sprites', label: 'Sprites', blurb: 'Sheets, tilesets and parallax', target: view('media', 'sprite') },
      { id: 'games', label: 'Games', blurb: 'Build and play-test', target: view('media', 'game') },
    ],
  },
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    tagline: 'Antivirus and agentic self-defense',
    // Phase 120 Theme B: every leaf lands on the Vanguard view, on its own tab.
    home: view('vanguard', 'findings'),
    features: [
      { id: 'antivirus', label: 'Antivirus', blurb: 'Real-time filesystem and process scanning', target: view('vanguard', 'findings') },
      { id: 'self-defense', label: 'Agentic Self-Defense', blurb: 'Guardrails and behavioral anomaly detection', target: view('vanguard', 'sensors') },
      { id: 'network', label: 'Network Monitor', blurb: 'Inspect outbound connections and API calls', target: view('vanguard', 'network') },
    ],
  },
  vault: {
    id: 'vault',
    name: 'Vault',
    tagline: 'Secrets and credentials for every app',
    vision:
      'One encrypted home for the API keys, forge tokens, database logins and model-provider keys every midnite app needs — unlocked once, shared with the apps you allow, and never written into a settings file in plain text.',
    home: view('vault'),
    features: [
      { id: 'secrets', label: 'Secrets', blurb: 'API keys and provider tokens', target: view('vault') },
      { id: 'accounts', label: 'Accounts', blurb: 'Forge and database logins', target: view('vault') },
    ],
  },
  cleaner: {
    id: 'cleaner',
    name: 'Cleaner',
    tagline: 'Workspace optimizer',
    vision:
      'Find what your machine is quietly carrying for you — stale node_modules, build caches, dead worktrees, simulator images — show what it costs, and give it back in one reviewed pass.',
    home: view('optimizer'),
    features: [
      { id: 'optimizer', label: 'Workspace optimizer', blurb: 'Reclaim space from caches and stale trees', target: view('optimizer') },
    ],
  },
  monitor: {
    id: 'monitor',
    name: 'Monitor',
    tagline: 'Live runtime state for your machine',
    vision:
      'Watch what your workspace is doing right now — CPU and memory, the processes and open ports your dev servers hold, the agent sessions still running, the terminal broker, and what the tokens are costing — and catch the runaway before it catches you.',
    home: view('settings'),
    features: [
      { id: 'health', label: 'System health', blurb: 'CPU, memory, processes and open ports', target: view('settings') },
      { id: 'sessions', label: 'Agent sessions', blurb: 'What is running, and for how long', target: view('sessions') },
      { id: 'diagnostics', label: 'Diagnostics', blurb: 'The terminal broker and token spend', target: view('settings') },
    ],
  },
  mind: {
    id: 'mind',
    name: 'Mind',
    tagline: 'Notes and spaced review',
    home: view('notes'),
    features: [
      { id: 'notes', label: 'Notes', blurb: 'Quick capture, linked and searchable', target: view('notes') },
      { id: 'review', label: 'Review', blurb: 'Notes into flashcards, on a schedule', target: view('notes') },
    ],
  },
  capture: {
    id: 'capture',
    name: 'Capture',
    tagline: 'Screenshots, recordings and clipboard',
    vision:
      'Grab a region, a window or a whole screen recording — then send it straight where it is needed: an agent chat, a pull-request comment or a Creator project — with a clipboard history so nothing you copied is ever one paste away from gone.',
    // Every leaf lands on the Capture view (Phase 113 Theme K), which holds all three under one page.
    home: view('capture'),
    features: [
      { id: 'screenshots', label: 'Screenshots', blurb: 'Regions, windows and whole screens', target: view('capture') },
      { id: 'recordings', label: 'Recordings', blurb: 'A screen or a window, as a clip', target: view('capture') },
      { id: 'clipboard', label: 'Clipboard', blurb: 'An opt-in history of what you copied', target: view('capture') },
    ],
  },
  money: {
    id: 'money',
    name: 'Money',
    tagline: 'Stocks, investments, crypto and trading',
    home: view('dashboard'),
    features: [
      { id: 'stocks', label: 'Stocks', blurb: 'Watchlists, quotes and charts', target: view('dashboard') },
      { id: 'investments', label: 'Investments', blurb: 'Portfolio, allocation and returns', target: view('dashboard') },
      { id: 'crypto', label: 'Crypto', blurb: 'Coins and wallets beside everything else', target: view('dashboard') },
      { id: 'trading', label: 'Trading', blurb: 'Place and track orders', target: view('dashboard') },
    ],
  },
  accountant: {
    id: 'accountant',
    name: 'Accountant',
    tagline: 'Accounting, tax calculation and bookkeeping',
    vision:
      'Automated bookkeeping, ledger management, and intelligent tax calculations tailored for freelancers, contractors, and growing teams.',
    home: view('landing'),
    features: [
      { id: 'accounting', label: 'Accounting', blurb: 'Double-entry bookkeeping and ledger tracking', target: view('landing') },
      { id: 'tax', label: 'Tax Calculation', blurb: 'Automated deductions, estimates and filing prep', target: view('landing') },
      { id: 'reports', label: 'Financial Reports', blurb: 'Balance sheets, P&L and cash flow', target: view('landing') },
    ],
    comingSoon: true,
  },
  science: {
    id: 'science',
    name: 'Science',
    tagline: 'Maths, physics, chemistry, biology and 3D visualization',
    home: view('landing'),
    features: [
      { id: 'research', label: 'Research', blurb: 'Maths, physics, chemistry and biology tabs', target: view('landing') },
      { id: 'visualization', label: 'Visualization', blurb: '3D visualisations and embedded artifacts', target: view('landing') },
      { id: 'templates', label: 'Templates', blurb: 'Reusable scientific notebook components', target: view('landing') },
    ],
  },
  simulator: {
    id: 'simulator',
    name: 'Simulator',
    tagline: 'Agent simulations, virtual worlds and cellular automata',
    vision:
      'Simulate multi-agent systems, orbital mechanics, virtual 3D worlds, and emergent complex phenomena like cellular automata in a real-time reactive sandbox.',
    home: view('landing'),
    features: [
      { id: 'environments', label: 'Agent Environments', blurb: 'Multi-agent interactions in 3D sandboxes', target: view('landing') },
      { id: 'worlds', label: 'Virtual Worlds', blurb: 'Solar systems, celestial physics and gravity', target: view('landing') },
      { id: 'emergence', label: 'Emergence', blurb: 'Cellular automata and Conway\'s Game of Life', target: view('landing') },
    ],
    comingSoon: true,
  },
  browser: {
    id: 'browser',
    name: 'Browser',
    tagline: 'A browser that agents can drive',
    home: { kind: 'browser', url: 'https://github.com/bilo-io/midnite-apps' },
    features: [
      {
        id: 'browse',
        label: 'Browse',
        blurb: 'Tabs with isolated sessions',
        target: { kind: 'browser', url: 'https://github.com/bilo-io/midnite-apps' },
      },
    ],
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    tagline: 'Every midnite app in one window',
    home: view('landing'),
    features: [
      { id: 'home', label: 'Home', blurb: 'The landing page', target: view('landing') },
      { id: 'graph', label: 'Git Graph', blurb: 'The commit graph', target: view('graph') },
      { id: 'dashboard', label: 'Dashboard', blurb: 'Everything at a glance', target: view('dashboard') },
    ],
  },
} as const satisfies Partial<Record<ModuleId, LauncherModule>>;

/** The id a module is opened by through `appLink` / `apps.open`: `module:<id>`. */
export const MODULE_FEATURE_PREFIX = 'module:';

type RawApp = Omit<LauncherApp, 'features'> & { features?: readonly AppFeature[] };

const RAW_APPS: readonly RawApp[] = [
  {
    id: 'studio',
    name: 'Studio',
    section: 'suite',
    accent: '#8b5cf6',
    gradient: 'brand',
    tagline: 'Every midnite app in one window',
    like: 'The whole suite, for power users',
    vision:
      'The master tool: every app beside it, in one desktop application with one rail. It is what the suite is built from today, and it stays the place for anyone who would rather have all of it at once.',
    home: view('landing'),
    // Studio composes every module (`APP_MODULES.studio`); its tile lists only its own.
    modules: [MODULES.studio],
    runsIn: 'studio',
  },
  {
    id: 'agents',
    name: 'Agents',
    section: 'suite',
    accent: '#8b5cf6',
    tagline: 'Chats, councils, graphs, code and creative tools',
    like: 'Like ChatGPT Desktop, LangGraph Studio and GitKraken',
    vision:
      'One place to talk to every agent CLI you have, put several of them on a question at once, and wire them into graphs that run on their own. Conversations keep their changes reviewable, a council answers with a synthesis rather than five tabs, and the repository loop — sessions, tasks, forge — and the creative studio sit in the same window.',
    home: view('chats'),
    modules: [MODULES.agents, MODULES.coder, MODULES.creator],
    runsIn: 'studio',
  },
  {
    id: 'gamer',
    name: 'Gamer',
    section: 'suite',
    accent: '#10b981',
    tagline: 'Maps, terrains, models, sprites and games',
    like: 'Like Tiled, Blockbench and World Machine',
    vision:
      'Make a game from real ground up: frame a place on a map, turn it into terrain, build the models and sprites that live on it, and play-test the result — with agents doing the heavy lifting through the midnite MCP tools.',
    home: view('media', 'game'),
    modules: [MODULES.gamer, MODULES.creator],
    runsIn: 'studio',
  },
  {
    id: 'media',
    name: 'Media',
    section: 'suite',
    accent: '#facc15',
    tagline: 'Your own media server — films, shows, music and photos',
    like: 'Like Plex and Jellyfin',
    vision:
      'Point it at your folders and it becomes a library: films and shows with artwork and watch progress, music, and photos, streamed to every screen in the house — transcoded on the fly, with nothing leaving your network unless you ask it to.',
    home: view('media', 'library'),
    modules: [MODULES.media, MODULES.creator],
    runsIn: 'studio',
  },
  {
    id: 'money',
    name: 'Money',
    section: 'suite',
    accent: '#84cc16',
    tagline: 'Stocks, investments, crypto, trading and the books',
    like: 'Like Robinhood, Yahoo Finance and QuickBooks',
    vision:
      'Every account you hold in one view — brokerage, crypto and cash — with live prices, allocation and performance over time, and the trades themselves a click away, with an agent to explain what moved and why. Bookkeeping and tax follow as the Accountant module.',
    home: view('dashboard'),
    modules: [MODULES.money, MODULES.accountant],
    runsIn: 'studio',
  },
  {
    id: 'mind',
    name: 'Mind',
    section: 'suite',
    accent: '#0ea5e9',
    tagline: 'Notes, spaced review, screenshots and clipboard',
    like: 'Like Obsidian, Anki and CleanShot X',
    vision:
      'A second brain that stays on your disk: notes you capture in a keystroke — or a screenshot, a recording, a clipboard history — then turned into flashcards and brought back on a schedule, so what you wrote down is still something you know a month later.',
    home: view('notes'),
    modules: [MODULES.mind, MODULES.capture],
    runsIn: 'studio',
  },
  {
    id: 'browser',
    name: 'Browser',
    section: 'suite',
    accent: '#f59e0b',
    tagline: 'A browser that agents can drive',
    like: 'Like Arc, with an agent in the seat',
    vision:
      'A focused browser with per-site isolation and the companion beside it — something an agent can read, steer and test against, not just a window you look through.',
    home: { kind: 'browser', url: 'https://github.com/bilo-io/midnite-apps' },
    modules: [MODULES.browser],
    runsIn: 'studio',
  },
  {
    id: 'science',
    name: 'Science',
    section: 'suite',
    accent: '#06b6d4',
    tagline: 'Maths, physics, chemistry, biology, 3D visualization and simulation',
    like: 'Like Wolfram, Jupyter and ChimeraX',
    vision:
      'A unified scientific environment for research, mathematical computing, simulation and 3D visualization of molecular and physical structures — with agent simulations, virtual worlds and cellular automata to follow as the Simulator module.',
    home: view('landing'),
    modules: [MODULES.science, MODULES.simulator],
    runsIn: 'studio',
    comingSoon: true,
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    section: 'suite',
    accent: '#e11d48',
    tagline: 'Antivirus, secrets, cleanup and live monitoring',
    like: 'Like CrowdStrike, 1Password and iStat Menus',
    vision:
      'Defend your machine against rogue agent actions, malicious tool executions, and external threats with proactive behavioral defense and runtime isolation — with the keys it guards in an encrypted vault, the caches it can clear, and the machine’s live state in view.',
    home: view('vanguard', 'findings'),
    modules: [MODULES.vanguard, MODULES.vault, MODULES.cleaner, MODULES.monitor],
    runsIn: 'studio',
  },
  {
    id: 'startup',
    name: 'Startup',
    section: 'suite',
    accent: '#8b5cf6',
    tagline: 'Roadmap, costs and lightweight ERP',
    like: 'Like Linear, Carta and NetSuite',
    vision:
      'All the foundational tooling for early-stage companies: clear milestone roadmaps, live burn rate and runway modeling, and modular lightweight ERP.',
    home: view('landing'),
    modules: [],
    features: [
      { id: 'roadmap', label: 'Roadmap', blurb: 'Milestones, dependencies and product timeline', target: view('landing') },
      { id: 'costs', label: 'Costs & Runway', blurb: 'Live burn tracking and financial modeling', target: view('landing') },
      { id: 'erp', label: 'ERP', blurb: 'Invoicing, vendor management and contracts', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
  },
  {
    id: 'health',
    name: 'Health',
    section: 'suite',
    accent: '#f43f5e',
    tagline: 'Health metrics, nutrition, meal and workout plans',
    like: 'Like Apple Health, MyFitnessPal and Strava',
    vision:
      'Track your personal wellness with total privacy: log biometrics, record meals and calories, plan progressive workout routines, and analyze long-term trends.',
    home: view('landing'),
    modules: [],
    features: [
      { id: 'biometrics', label: 'Biometrics', blurb: 'Optional height, weight, age and body metrics', target: view('landing') },
      { id: 'nutrition', label: 'Nutrition', blurb: 'Meal logger and calorie counter', target: view('landing') },
      { id: 'workouts', label: 'Workout Plans', blurb: 'Custom training schedules and progressive overload', target: view('landing') },
      { id: 'progress', label: 'Progress', blurb: 'Trend analytics and wellness reports', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
  },
];

export const APPS: readonly LauncherApp[] = RAW_APPS.map((app) => ({
  ...app,
  features: app.features ?? app.modules.flatMap((m) => m.features),
}));

export function appById(id: AppId): LauncherApp {
  const app = APPS.find((a) => a.id === id);
  if (!app) throw new Error(`unknown app ${id}`);
  return app;
}

/** What an Open on `featureId` lands on: a feature, or `module:<id>` for a module's own front door. */
export function openTarget(app: LauncherApp, featureId?: string): StudioTarget {
  if (featureId === undefined) return app.home;
  if (featureId.startsWith(MODULE_FEATURE_PREFIX)) {
    const mod = app.modules.find((m) => m.id === featureId.slice(MODULE_FEATURE_PREFIX.length));
    return mod?.home ?? app.home;
  }
  return app.features.find((f) => f.id === featureId)?.target ?? app.home;
}
