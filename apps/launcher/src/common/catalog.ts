// Type-only, by source path: erased at build, so neither bundle pulls `shared`'s zod.
import type { ViewId } from '@midnite/studio-shared/domain/view';
import type { MediaTab } from '@midnite/studio-shared/media';

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
  | { kind: 'view'; view: ViewId; tab?: MediaTab }
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

export const SECTION_ORDER: readonly AppSection[] = ['suite', 'utilities'];

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
  features: readonly AppFeature[];
  /** Which installed product carries it today. Every app is `studio` for now. */
  runsIn: 'studio';
  /** When true, the app is listed as coming soon and cannot be installed or opened yet. */
  comingSoon?: boolean;
};

export const APP_IDS = [
  'studio',
  'agents',
  'coder',
  'gamer',
  'creator',
  'media',
  'money',
  'mind',
  'science',
  'accountant',
  'startup',
  'simulator',
  'health',
  'browser',
  'cleaner',
  'vault',
  'capture',
  'monitor',
  'vanguard',
] as const;
export type AppId = (typeof APP_IDS)[number];

const view = (v: ViewId, tab?: MediaTab): StudioTarget =>
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

export const APPS: readonly LauncherApp[] = [
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
    features: [
      { id: 'home', label: 'Home', blurb: 'The landing page', target: view('landing') },
      { id: 'graph', label: 'Git Graph', blurb: 'The commit graph', target: view('graph') },
      { id: 'dashboard', label: 'Dashboard', blurb: 'Everything at a glance', target: view('dashboard') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'agents',
    name: 'Agents',
    section: 'suite',
    accent: '#8b5cf6',
    tagline: 'Chats, councils, graphs and local models',
    like: 'Like ChatGPT Desktop and LangGraph Studio',
    vision:
      'One place to talk to every agent CLI you have, put several of them on a question at once, and wire them into graphs that run on their own. Conversations keep their changes reviewable, and a council answers with a synthesis rather than five tabs.',
    home: view('chats'),
    features: [
      { id: 'chats', label: 'Chats', blurb: 'Agent-CLI conversations with reviewable changes', target: view('chats') },
      { id: 'councils', label: 'Councils', blurb: 'Several agents on one question, one synthesis', target: view('councils') },
      { id: 'graphs', label: 'Graphs', blurb: 'Agent workflows as runnable graphs', target: view('workflows') },
      { id: 'models', label: 'Models', blurb: 'Local models, run on your own machine', target: view('models') },
      { id: 'tools', label: 'Tools (MCP)', blurb: 'MCP servers your agents can call', target: view('settings') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'coder',
    name: 'Coder',
    section: 'suite',
    accent: '#2e7cfa',
    tagline: 'Sessions, tasks, forge, APIs and databases',
    like: 'Like GitKraken, Postman and TablePlus',
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
    features: [
      { id: 'maps', label: 'Maps', blurb: 'Real places, measured and captured', target: view('media', 'map') },
      { id: 'terrains', label: 'Terrains', blurb: 'Heightmaps into game-ready landscapes', target: view('media', 'terrain') },
      { id: 'models', label: '3D Models', blurb: 'Spec, render, look, patch', target: view('media', 'model') },
      { id: 'sprites', label: 'Sprites', blurb: 'Sheets, tilesets and parallax', target: view('media', 'sprite') },
      { id: 'games', label: 'Games', blurb: 'Build and play-test', target: view('media', 'game') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'creator',
    name: 'Creator',
    section: 'suite',
    accent: '#ec4899',
    tagline: 'Docs, images, audio and video',
    like: 'Like Notion, Midjourney and CapCut',
    vision:
      'Write, generate and edit in one studio: long-form docs, image generation, music and voice, and video cut from an editorial script — every asset a file in your project rather than a row in someone else’s cloud.',
    home: view('media', 'doc'),
    features: [
      { id: 'docs', label: 'Docs', blurb: 'Markdown documents with threads', target: view('media', 'doc') },
      { id: 'images', label: 'Images', blurb: 'Prompts, providers and variations', target: view('media', 'image') },
      { id: 'audio', label: 'Audio', blurb: 'Songs, loops and soundtracks', target: view('media', 'audio') },
      { id: 'video', label: 'Video', blurb: 'Editorial scripts into cuts', target: view('media', 'video') },
    ],
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
    // Every leaf lands on Media ▸ Library (Phase 113 Theme R), which holds all four kinds under one tab.
    home: view('media', 'library'),
    features: [
      { id: 'library', label: 'Movies & Shows', blurb: 'A browsable library with progress', target: view('media', 'library') },
      { id: 'music', label: 'Music', blurb: 'Albums, artists and playlists', target: view('media', 'library') },
      { id: 'photos', label: 'Photos', blurb: 'Albums from your folders', target: view('media', 'library') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'money',
    name: 'Money',
    section: 'suite',
    accent: '#84cc16',
    tagline: 'Stocks, investments, crypto and trading',
    like: 'Like Robinhood, Yahoo Finance and Delta',
    vision:
      'Every account you hold in one view — brokerage, crypto and cash — with live prices, allocation and performance over time, and the trades themselves a click away, with an agent to explain what moved and why.',
    home: view('dashboard'),
    features: [
      { id: 'stocks', label: 'Stocks', blurb: 'Watchlists, quotes and charts', target: view('dashboard') },
      { id: 'investments', label: 'Investments', blurb: 'Portfolio, allocation and returns', target: view('dashboard') },
      { id: 'crypto', label: 'Crypto', blurb: 'Coins and wallets beside everything else', target: view('dashboard') },
      { id: 'trading', label: 'Trading', blurb: 'Place and track orders', target: view('dashboard') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'mind',
    name: 'Mind',
    section: 'suite',
    accent: '#0ea5e9',
    tagline: 'Notes and spaced review',
    like: 'Like Obsidian and Anki',
    vision:
      'A second brain that stays on your disk: notes you capture in a keystroke, then turned into flashcards and brought back on a schedule — so what you wrote down is still something you know a month later.',
    home: view('notes'),
    features: [
      { id: 'notes', label: 'Notes', blurb: 'Quick capture, linked and searchable', target: view('notes') },
      { id: 'review', label: 'Review', blurb: 'Notes into flashcards, on a schedule', target: view('notes') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'science',
    name: 'Science',
    section: 'suite',
    accent: '#06b6d4',
    tagline: 'Maths, physics, chemistry, biology and 3D visualization',
    like: 'Like Wolfram, Jupyter and ChimeraX',
    vision:
      'A unified scientific environment for research, mathematical computing, simulation and 3D visualization of molecular and physical structures.',
    home: view('landing'),
    features: [
      { id: 'research', label: 'Research', blurb: 'Maths, physics, chemistry and biology tabs', target: view('landing') },
      { id: 'visualization', label: 'Visualization', blurb: '3D visualisations and embedded artifacts', target: view('landing') },
      { id: 'templates', label: 'Templates', blurb: 'Reusable scientific notebook components', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
  },
  {
    id: 'accountant',
    name: 'Accountant',
    section: 'suite',
    accent: '#10b981',
    tagline: 'Accounting, tax calculation and bookkeeping',
    like: 'Like QuickBooks, Xero and TurboTax',
    vision:
      'Automated bookkeeping, ledger management, and intelligent tax calculations tailored for freelancers, contractors, and growing teams.',
    home: view('landing'),
    features: [
      { id: 'accounting', label: 'Accounting', blurb: 'Double-entry bookkeeping and ledger tracking', target: view('landing') },
      { id: 'tax', label: 'Tax Calculation', blurb: 'Automated deductions, estimates and filing prep', target: view('landing') },
      { id: 'reports', label: 'Financial Reports', blurb: 'Balance sheets, P&L and cash flow', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
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
    features: [
      { id: 'roadmap', label: 'Roadmap', blurb: 'Milestones, dependencies and product timeline', target: view('landing') },
      { id: 'costs', label: 'Costs & Runway', blurb: 'Live burn tracking and financial modeling', target: view('landing') },
      { id: 'erp', label: 'ERP', blurb: 'Invoicing, vendor management and contracts', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
  },
  {
    id: 'simulator',
    name: 'Simulator',
    section: 'suite',
    accent: '#d946ef',
    tagline: 'Agent simulations, virtual worlds and cellular automata',
    like: 'Like NetLogo, Universe Sandbox and Conway\'s Game of Life',
    vision:
      'Simulate multi-agent systems, orbital mechanics, virtual 3D worlds, and emergent complex phenomena like cellular automata in a real-time reactive sandbox.',
    home: view('landing'),
    features: [
      { id: 'environments', label: 'Agent Environments', blurb: 'Multi-agent interactions in 3D sandboxes', target: view('landing') },
      { id: 'worlds', label: 'Virtual Worlds', blurb: 'Solar systems, celestial physics and gravity', target: view('landing') },
      { id: 'emergence', label: 'Emergence', blurb: 'Cellular automata and Conway\'s Game of Life', target: view('landing') },
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
    features: [
      { id: 'biometrics', label: 'Biometrics', blurb: 'Optional height, weight, age and body metrics', target: view('landing') },
      { id: 'nutrition', label: 'Nutrition', blurb: 'Meal logger and calorie counter', target: view('landing') },
      { id: 'workouts', label: 'Workout Plans', blurb: 'Custom training schedules and progressive overload', target: view('landing') },
      { id: 'progress', label: 'Progress', blurb: 'Trend analytics and wellness reports', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
  },
  {
    id: 'browser',
    name: 'Browser',
    section: 'utilities',
    accent: '#f59e0b',
    tagline: 'A browser that agents can drive',
    like: 'Like Arc, with an agent in the seat',
    vision:
      'A focused browser with per-site isolation and the companion beside it — something an agent can read, steer and test against, not just a window you look through.',
    home: { kind: 'browser', url: 'https://github.com/bilo-io/midnite-apps' },
    features: [
      {
        id: 'browse',
        label: 'Browse',
        blurb: 'Tabs with isolated sessions',
        target: { kind: 'browser', url: 'https://github.com/bilo-io/midnite-apps' },
      },
    ],
    runsIn: 'studio',
  },
  {
    id: 'cleaner',
    name: 'Cleaner',
    section: 'utilities',
    accent: '#14b8a6',
    tagline: 'Workspace optimizer',
    like: 'Like CleanMyMac, for developers',
    vision:
      'Find what your machine is quietly carrying for you — stale node_modules, build caches, dead worktrees, simulator images — show what it costs, and give it back in one reviewed pass.',
    home: view('optimizer'),
    features: [
      { id: 'optimizer', label: 'Workspace optimizer', blurb: 'Reclaim space from caches and stale trees', target: view('optimizer') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'vault',
    name: 'Vault',
    section: 'utilities',
    accent: '#6366f1',
    tagline: 'Secrets and credentials for every app',
    like: 'Like 1Password, for keys and tokens',
    vision:
      'One encrypted home for the API keys, forge tokens, database logins and model-provider keys every midnite app needs — unlocked once, shared with the apps you allow, and never written into a settings file in plain text.',
    home: view('vault'),
    features: [
      { id: 'secrets', label: 'Secrets', blurb: 'API keys and provider tokens', target: view('vault') },
      { id: 'accounts', label: 'Accounts', blurb: 'Forge and database logins', target: view('vault') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'capture',
    name: 'Capture',
    section: 'utilities',
    accent: '#f97316',
    tagline: 'Screenshots, recordings and clipboard',
    like: 'Like CleanShot X and Raycast clipboard',
    vision:
      'Grab a region, a window or a whole screen recording — then send it straight where it is needed: an agent chat, a pull-request comment or a Creator project — with a clipboard history so nothing you copied is ever one paste away from gone.',
    // Every leaf lands on the Capture view (Phase 113 Theme K), which holds all three under one page.
    home: view('capture'),
    features: [
      { id: 'screenshots', label: 'Screenshots', blurb: 'Regions, windows and whole screens', target: view('capture') },
      { id: 'recordings', label: 'Recordings', blurb: 'A screen or a window, as a clip', target: view('capture') },
      { id: 'clipboard', label: 'Clipboard', blurb: 'An opt-in history of what you copied', target: view('capture') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'monitor',
    name: 'Monitor',
    section: 'utilities',
    accent: '#ef4444',
    tagline: 'Live runtime state for your machine',
    like: 'Like iStat Menus and Activity Monitor, for developers',
    vision:
      'Watch what your workspace is doing right now — CPU and memory, the processes and open ports your dev servers hold, the agent sessions still running, the terminal broker, and what the tokens are costing — and catch the runaway before it catches you.',
    home: view('settings'),
    features: [
      { id: 'health', label: 'System health', blurb: 'CPU, memory, processes and open ports', target: view('settings') },
      { id: 'sessions', label: 'Agent sessions', blurb: 'What is running, and for how long', target: view('sessions') },
      { id: 'diagnostics', label: 'Diagnostics', blurb: 'The terminal broker and token spend', target: view('settings') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    section: 'utilities',
    accent: '#e11d48',
    tagline: 'Antivirus and agentic self-defense',
    like: 'Like CrowdStrike, Little Snitch and SentinelOne',
    vision:
      'Defend your machine against rogue agent actions, malicious tool executions, and external threats with proactive behavioral defense and runtime isolation.',
    home: view('landing'),
    features: [
      { id: 'antivirus', label: 'Antivirus', blurb: 'Real-time filesystem and process scanning', target: view('landing') },
      { id: 'self-defense', label: 'Agentic Self-Defense', blurb: 'Guardrails and behavioral anomaly detection', target: view('landing') },
      { id: 'network', label: 'Network Monitor', blurb: 'Inspect outbound connections and API calls', target: view('landing') },
    ],
    runsIn: 'studio',
    comingSoon: true,
  },
];

export function appById(id: AppId): LauncherApp {
  const app = APPS.find((a) => a.id === id);
  if (!app) throw new Error(`unknown app ${id}`);
  return app;
}
