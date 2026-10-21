import { assetHref } from '../routes';

/**
 * The midnite apps, as the site presents them.
 *
 * **A copy, not an import.** The launcher's own list is
 * `apps/launcher/src/common/catalog.ts`, and the site may not reach across a
 * package boundary for it: the website is off the graph so it can move out of
 * this repo, and a static marketing bundle has no use for the launcher's
 * `StudioTarget`s or `ViewId`s anyway. So this file carries only what a visitor
 * reads (name, colour, pitch, features) and is kept in step by hand. When an
 * app is added to, renamed in or promoted out of "coming soon" in the
 * launcher's list, it changes here too, and its logo is copied into
 * `public/img/apps/` from `apps/launcher/src/renderer/assets/app-logos/`.
 *
 * **Available apps only.** The launcher also lists apps marked `comingSoon`;
 * the site leaves them out until they can be opened, so nothing here promises
 * a product a visitor cannot install.
 *
 * Copy is the launcher's, rewritten where it used a dash as punctuation: the
 * site's house style has none in visitor-facing text (`landing-copy.test.tsx`).
 */

export type SiteAppSection = 'suite' | 'utilities';

export const SECTION_LABELS: Record<SiteAppSection, string> = {
  suite: 'Suite',
  utilities: 'Utility',
};

export type SiteAppFeature = { label: string; blurb: string };

export type SiteApp = {
  /** The launcher's id, and the URL fragment on the Apps page (`/apps/#coder`). */
  id: string;
  /** The second half of the wordmark: Midnite **Coder**. */
  name: string;
  section: SiteAppSection;
  /** The app's accent, as the launcher draws it. */
  accent: string;
  /**
   * Four stops read off the app's logo, darkest first: the deep shade, the
   * logo's own two tones, and one neighbouring hue so the hero's gradient moves
   * through a spectrum rather than pulsing one colour. The crescent logos are a
   * single hue on a dark tile, so the first three are that hue and the fourth is
   * what keeps the background alive.
   */
  spectrum: readonly [string, string, string, string];
  /** One line under the name. */
  tagline: string;
  /** The tools it stands beside, for orientation, never a claim of parity. */
  like: string;
  /** What the app is for, in two or three sentences. */
  vision: string;
  features: readonly SiteAppFeature[];
};

export const SITE_APPS: readonly SiteApp[] = [
  {
    id: 'studio',
    name: 'Studio',
    section: 'suite',
    accent: '#8b5cf6',
    spectrum: ['#2b3a8f', '#4f7cf7', '#8245ba', '#c056d6'],
    tagline: 'Every midnite app in one window',
    like: 'The whole suite, for power users',
    vision:
      'The master tool: every app beside it, in one desktop application with one rail. It is what the suite is built from today, and it stays the place for anyone who would rather have all of it at once.',
    features: [
      { label: 'Every app', blurb: 'The whole suite behind one rail' },
      { label: 'Git Graph', blurb: 'The commit graph, for any repo you open' },
      { label: 'Dashboard', blurb: 'Everything at a glance' },
    ],
  },
  {
    id: 'agents',
    name: 'Agents',
    section: 'suite',
    accent: '#8b5cf6',
    spectrum: ['#2e1f6b', '#6a48b9', '#ac8fed', '#e879f9'],
    tagline: 'Chats, councils, graphs and local models',
    like: 'Like ChatGPT Desktop and LangGraph Studio',
    vision:
      'One place to talk to every agent CLI you have, put several of them on a question at once, and wire them into graphs that run on their own. Conversations keep their changes reviewable, and a council answers with a synthesis rather than five tabs.',
    features: [
      { label: 'Chats', blurb: 'Agent CLI conversations with reviewable changes' },
      { label: 'Councils', blurb: 'Several agents on one question, one synthesis' },
      { label: 'Graphs', blurb: 'Agent workflows as runnable graphs' },
      { label: 'Models', blurb: 'Local models, run on your own machine' },
      { label: 'Tools (MCP)', blurb: 'MCP servers your agents can call' },
    ],
  },
  {
    id: 'coder',
    name: 'Coder',
    section: 'suite',
    accent: '#2e7cfa',
    spectrum: ['#16306e', '#265cb2', '#4989f0', '#22d3ee'],
    tagline: 'Sessions, tasks, forge, APIs and databases',
    like: 'Like GitKraken, Postman and TablePlus',
    vision:
      'The loop around a repository in one window: agent sessions working in worktrees, the tasks they pick up, the forge (pull requests, checks, reviews) beside the graph they change, and the API and database you are building against one tab away.',
    features: [
      { label: 'Sessions', blurb: 'Agent sessions across your worktrees' },
      { label: 'Tasks', blurb: 'Boards, issues and what is next' },
      { label: 'Git Forge', blurb: 'Pull requests, checks and reviews' },
      { label: 'API Explorer', blurb: 'Requests, collections and environments' },
      { label: 'DB Explorer', blurb: 'Browse and query your databases' },
    ],
  },
  {
    id: 'gamer',
    name: 'Gamer',
    section: 'suite',
    accent: '#10b981',
    spectrum: ['#064e3b', '#128a62', '#54c8a1', '#a3e635'],
    tagline: 'Maps, terrains, models, sprites and games',
    like: 'Like Tiled, Blockbench and World Machine',
    vision:
      'Make a game from real ground up: frame a place on a map, turn it into terrain, build the models and sprites that live on it, and play-test the result, with agents doing the heavy lifting through the midnite MCP tools.',
    features: [
      { label: 'Maps', blurb: 'Real places, measured and captured' },
      { label: 'Terrains', blurb: 'Heightmaps into game-ready landscapes' },
      { label: '3D Models', blurb: 'Spec, render, look, patch' },
      { label: 'Sprites', blurb: 'Sheets, tilesets and parallax' },
      { label: 'Games', blurb: 'Build and play-test' },
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    section: 'suite',
    accent: '#ec4899',
    spectrum: ['#6b1543', '#b03873', '#e67cb0', '#c084fc'],
    tagline: 'Docs, images, audio and video',
    like: 'Like Notion, Midjourney and CapCut',
    vision:
      'Write, generate and edit in one studio: long-form docs, image generation, music and voice, and video cut from an editorial script. Every asset is a file in your project rather than a row in someone else’s cloud.',
    features: [
      { label: 'Docs', blurb: 'Markdown documents with threads' },
      { label: 'Images', blurb: 'Prompts, providers and variations' },
      { label: 'Audio', blurb: 'Songs, loops and soundtracks' },
      { label: 'Video', blurb: 'Editorial scripts into cuts' },
    ],
  },
  {
    id: 'media',
    name: 'Media',
    section: 'suite',
    accent: '#facc15',
    spectrum: ['#6b4a0c', '#b99816', '#f5d75e', '#fb923c'],
    tagline: 'Your own media server for films, shows, music and photos',
    like: 'Like Plex and Jellyfin',
    vision:
      'Point it at your folders and it becomes a library: films and shows with artwork and watch progress, music, and photos, streamed to every screen in the house. It transcodes on the fly, and nothing leaves your network unless you ask it to.',
    features: [
      { label: 'Movies & Shows', blurb: 'A browsable library with progress' },
      { label: 'Music', blurb: 'Albums, artists and playlists' },
      { label: 'Photos', blurb: 'Albums from your folders' },
    ],
  },
  {
    id: 'money',
    name: 'Money',
    section: 'suite',
    accent: '#84cc16',
    spectrum: ['#2f4a10', '#659619', '#a0d354', '#34d399'],
    tagline: 'Stocks, investments, crypto and trading',
    like: 'Like Robinhood, Yahoo Finance and Delta',
    vision:
      'Every account you hold in one view (brokerage, crypto and cash) with live prices, allocation and performance over time, and the trades themselves a click away, with an agent to explain what moved and why.',
    features: [
      { label: 'Stocks', blurb: 'Watchlists, quotes and charts' },
      { label: 'Investments', blurb: 'Portfolio, allocation and returns' },
      { label: 'Crypto', blurb: 'Coins and wallets beside everything else' },
      { label: 'Trading', blurb: 'Place and track orders' },
    ],
  },
  {
    id: 'mind',
    name: 'Mind',
    section: 'suite',
    accent: '#0ea5e9',
    spectrum: ['#0b3d5c', '#137dad', '#4fb8e7', '#818cf8'],
    tagline: 'Notes and spaced review',
    like: 'Like Obsidian and Anki',
    vision:
      'A second brain that stays on your disk: notes you capture in a keystroke, then turned into flashcards and brought back on a schedule, so what you wrote down is still something you know a month later.',
    features: [
      { label: 'Notes', blurb: 'Quick capture, linked and searchable' },
      { label: 'Review', blurb: 'Notes into flashcards, on a schedule' },
    ],
  },
  {
    id: 'browser',
    name: 'Browser',
    section: 'suite',
    accent: '#f59e0b',
    spectrum: ['#6b2a0c', '#b2750f', '#edb049', '#fb7185'],
    tagline: 'A browser that agents can drive',
    like: 'Like Arc, with an agent in the seat',
    vision:
      'A focused browser with per-site isolation and the companion beside it: something an agent can read, steer and test against, not just a window you look through.',
    features: [{ label: 'Browse', blurb: 'Tabs with isolated sessions' }],
  },
  {
    id: 'cleaner',
    name: 'Cleaner',
    section: 'utilities',
    accent: '#14b8a6',
    spectrum: ['#0f3f3b', '#148579', '#45c1b3', '#38bdf8'],
    tagline: 'Workspace optimizer',
    like: 'Like CleanMyMac, for developers',
    vision:
      'Find what your machine is quietly carrying for you (stale node_modules, build caches, dead worktrees, simulator images), show what it costs, and give it back in one reviewed pass.',
    features: [{ label: 'Workspace optimizer', blurb: 'Reclaim space from caches and stale trees' }],
  },
  {
    id: 'vault',
    name: 'Vault',
    section: 'utilities',
    accent: '#6366f1',
    spectrum: ['#1e1b4b', '#4d4fb5', '#9495ec', '#c084fc'],
    tagline: 'Secrets and credentials for every app',
    like: 'Like 1Password, for keys and tokens',
    vision:
      'One encrypted home for the API keys, forge tokens, database logins and model provider keys every midnite app needs: unlocked once, shared with the apps you allow, and never written into a settings file in plain text.',
    features: [
      { label: 'Secrets', blurb: 'API keys and provider tokens' },
      { label: 'Accounts', blurb: 'Forge and database logins' },
    ],
  },
  {
    id: 'capture',
    name: 'Capture',
    section: 'utilities',
    accent: '#f97316',
    spectrum: ['#6b2410', '#bb5914', '#f29d62', '#facc15'],
    tagline: 'Screenshots, recordings and clipboard',
    like: 'Like CleanShot X and Raycast clipboard',
    vision:
      'Grab a region, a window or a whole screen recording, then send it straight where it is needed: an agent chat, a pull request comment or a Creator project. A clipboard history means nothing you copied is one paste away from gone.',
    features: [
      { label: 'Screenshots', blurb: 'Regions, windows and whole screens' },
      { label: 'Recordings', blurb: 'A screen or a window, as a clip' },
      { label: 'Clipboard', blurb: 'An opt-in history of what you copied' },
    ],
  },
  {
    id: 'monitor',
    name: 'Monitor',
    section: 'utilities',
    accent: '#ef4444',
    spectrum: ['#6b1717', '#b33636', '#e87f7f', '#f97316'],
    tagline: 'Live runtime state for your machine',
    like: 'Like iStat Menus and Activity Monitor, for developers',
    vision:
      'Watch what your workspace is doing right now: CPU and memory, the processes and open ports your dev servers hold, the agent sessions still running, the terminal broker, and what the tokens are costing. Catch the runaway before it catches you.',
    features: [
      { label: 'System health', blurb: 'CPU, memory, processes and open ports' },
      { label: 'Agent sessions', blurb: 'What is running, and for how long' },
      { label: 'Diagnostics', blurb: 'The terminal broker and token spend' },
    ],
  },
];

/** The launcher's own spectrum: the brand ramp Studio wears, for the landing hero. */
export const LAUNCHER_SPECTRUM: SiteApp['spectrum'] = ['#2b3a8f', '#4f7cf7', '#8245ba', '#c056d6'];

/**
 * The frame every midnite app is built on: present in each of them, never an
 * app of its own. The launcher's `FRAME_PARTS`, in the same order.
 */
export const FRAME_PARTS: readonly SiteAppFeature[] = [
  { label: 'Layout', blurb: 'Title bar with breadcrumbs, nav rail and status bar' },
  { label: 'Terminal', blurb: 'Integrated terminals that survive restarts' },
  { label: 'Companion', blurb: 'The voice and chat assistant docked on the right' },
  { label: 'Loops', blurb: 'Recurring agent runs, on a schedule' },
  { label: 'Browser', blurb: 'An embedded browser panel' },
  { label: 'Explorer', blurb: 'Files, search and the workspace tree' },
  { label: 'Git Graph', blurb: 'The commit graph, for any repo you open' },
  { label: 'Knowledge', blurb: 'The graph linking code, notes and conversations' },
];

/** A base-aware URL for an app's logo, copied from the launcher into `public/img/apps/`. */
export const appLogoHref = (id: string): string => assetHref(`img/apps/${id}.png`);

/** The apps in one section, in catalog order. */
export const appsIn = (section: SiteAppSection): readonly SiteApp[] =>
  SITE_APPS.filter((app) => app.section === section);

/** The index of the app a URL fragment names, or `null` for anything else. */
export const appIndexFromHash = (hash: string, apps: readonly SiteApp[] = SITE_APPS): number | null => {
  const id = hash.replace(/^#/, '');
  const index = apps.findIndex((app) => app.id === id);
  return index === -1 ? null : index;
};

/**
 * The app's spectrum as CSS custom properties, for the aurora and the pills to
 * read. One object so every surface that wears an app's colours (the hero
 * slide, the card, the page glow) names the same four variables.
 */
export const spectrumVars = (spectrum: SiteApp['spectrum']): Record<string, string> => ({
  '--app-c1': spectrum[0],
  '--app-c2': spectrum[1],
  '--app-c3': spectrum[2],
  '--app-c4': spectrum[3],
});
