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

export type AppSection = 'suite' | 'utilities' | 'all-in-one';

export const SECTION_LABELS: Record<AppSection, string> = {
  suite: 'Midnite Apps',
  utilities: 'Utilities',
  'all-in-one': 'All-in-one',
};

export const SECTION_ORDER: readonly AppSection[] = ['suite', 'utilities', 'all-in-one'];

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
};

export const APP_IDS = ['agents', 'coder', 'gamer', 'creator', 'media', 'browser', 'cleaner', 'studio'] as const;
export type AppId = (typeof APP_IDS)[number];

const view = (v: ViewId, tab?: MediaTab): StudioTarget =>
  tab === undefined ? { kind: 'view', view: v } : { kind: 'view', view: v, tab };

/**
 * The shell every midnite app is built on — present in each of them, never an
 * app of its own. Listed once here so the detail sheet can say so.
 */
export const SHELL_PARTS: readonly { label: string; blurb: string }[] = [
  { label: 'Layout', blurb: 'Title bar with breadcrumbs, nav rail, status bar' },
  { label: 'Terminal', blurb: 'Integrated terminals that survive restarts' },
  { label: 'Companion', blurb: 'The voice-and-chat assistant docked on the right' },
  { label: 'Loops', blurb: 'Recurring agent runs, on a schedule' },
  { label: 'Browser', blurb: 'An embedded browser panel' },
  { label: 'Explorer', blurb: 'Files, search and the workspace tree' },
  { label: 'Git Graph', blurb: 'The commit graph, for any repo you open' },
];

export const APPS: readonly LauncherApp[] = [
  {
    id: 'agents',
    name: 'Agents',
    section: 'suite',
    accent: '#8b5cf6',
    tagline: 'Chats, councils and agent graphs',
    like: 'Like ChatGPT Desktop and LangGraph Studio',
    vision:
      'One place to talk to every agent CLI you have, put several of them on a question at once, and wire them into graphs that run on their own. Conversations keep their changes reviewable, and a council answers with a synthesis rather than five tabs.',
    home: view('chats'),
    features: [
      { id: 'chats', label: 'Chats', blurb: 'Agent-CLI conversations with reviewable changes', target: view('chats') },
      { id: 'councils', label: 'Councils', blurb: 'Several agents on one question, one synthesis', target: view('councils') },
      { id: 'graphs', label: 'Graphs', blurb: 'Agent workflows as runnable graphs', target: view('workflows') },
    ],
    runsIn: 'studio',
  },
  {
    id: 'coder',
    name: 'Coder',
    section: 'suite',
    accent: '#2e7cfa',
    tagline: 'Sessions, forge, APIs and databases',
    like: 'Like GitKraken, Postman and TablePlus',
    vision:
      'The loop around a repository in one window: agent sessions working in worktrees, the forge — pull requests, checks, reviews — beside the graph they change, and the API and database you are building against one tab away.',
    home: view('sessions'),
    features: [
      { id: 'sessions', label: 'Sessions', blurb: 'Agent sessions across your worktrees', target: view('sessions') },
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
    home: view('media', 'video'),
    features: [
      { id: 'library', label: 'Movies & Shows', blurb: 'A browsable library with progress', target: view('media', 'video') },
      { id: 'music', label: 'Music', blurb: 'Albums, artists and playlists', target: view('media', 'audio') },
      { id: 'photos', label: 'Photos', blurb: 'Albums from your folders', target: view('media', 'image') },
    ],
    runsIn: 'studio',
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
    id: 'studio',
    name: 'Studio',
    section: 'all-in-one',
    accent: '#8b5cf6',
    gradient: 'brand',
    tagline: 'Every midnite app in one window',
    like: 'The whole suite, for power users',
    vision:
      'The master tool: every app above, in one desktop application with one rail. It is what the suite is built from today, and it stays the place for anyone who would rather have all of it at once.',
    home: view('landing'),
    features: [
      { id: 'home', label: 'Home', blurb: 'The landing page', target: view('landing') },
      { id: 'graph', label: 'Git Graph', blurb: 'The commit graph', target: view('graph') },
      { id: 'dashboard', label: 'Dashboard', blurb: 'Everything at a glance', target: view('dashboard') },
    ],
    runsIn: 'studio',
  },
];

export function appById(id: AppId): LauncherApp {
  const app = APPS.find((a) => a.id === id);
  if (!app) throw new Error(`unknown app ${id}`);
  return app;
}
