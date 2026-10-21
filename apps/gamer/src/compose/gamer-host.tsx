import { createStandaloneMediaHost, type MediaHost } from '@midnite/studio-feature-media-core/renderer';
import type { GameHost } from '@midnite/studio-feature-media-game/renderer';
import { useMapFocus, type MapHost } from '@midnite/studio-feature-media-map/renderer';
import { modelSpriteSeams, type ModelHost } from '@midnite/studio-feature-media-model/renderer';
import type { SpriteHost } from '@midnite/studio-feature-media-sprite/renderer';
import type { TerrainHost } from '@midnite/studio-feature-media-terrain/renderer';
import type { MediaTab } from '@midnite/studio-shared';

import { GAMER_GAME_AGENT_UI } from './gamer-game-agent';

/**
 * The host ports Gamer implements (Phase 113 Theme S).
 *
 * Gamer has no repository list: its media lives under one root that main registers as the repository
 * `gamer` (`main/context.ts`), so the media shell is scoped to that id. Its state — the tab it was on,
 * pane widths — persists in Gamer's own localStorage, never in Studio's. The tab features take plain
 * defaults for everything else: no terminal, no agent roster, no Timeline — those controls are simply not offered
 * (Games' create and iterate is the exception: its two confinable agent CLIs are offered by id).
 * Sprites and Models share the Model feature's seams; keys come from the runtime vault in main (`main/keys.ts`)
 * and never cross this port.
 */
export const GAMER_REPO_ID = 'gamer';

const base = createStandaloneMediaHost({
  repoId: GAMER_REPO_ID,
  key: 'midnite-gamer.media',
  initialTab: 'game',
  noRepoBody: (_tab, label) => `${label} live in Midnite Gamer's media folder.`,
});

/** Terrain's "Show on map" needs the app's tab switch, which only the shell's host holds — captured on first render. */
let setActiveTab: ((tab: MediaTab) => void) | null = null;

export const GAMER_MEDIA_HOST: MediaHost = {
  ...base,
  useActiveTab() {
    const active = base.useActiveTab();
    setActiveTab = active[1];
    return active;
  },
};

/** Maps measure in metres: Gamer has no Settings page to choose imperial. */
export const GAMER_MAP_HOST: MapHost = {};

/** "Show on map" posts the request to Maps' focus store and brings the Maps tab up. */
export const GAMER_TERRAIN_HOST: TerrainHost = {
  showOnMap: (request) => {
    useMapFocus.getState().focus(request);
    setActiveTab?.('map');
  },
};

/**
 * Sprites with what Gamer has: the plain composer, and the Model tab's seams — rigged models to render from,
 * the engine a map's layout is written by, and the three.js render job (loaded on the first render request).
 * The render itself runs in the window's `SpriteRenderHost`, which `GamerApp` mounts.
 */
export const GAMER_SPRITE_HOST: SpriteHost = { ...modelSpriteSeams };

/** The lazy import of the 3D render job, for the window's `SpriteRenderHost` (mounted outside any tab). */
export const loadSpriteRenderJob = () => import('@midnite/studio-feature-media-model/render-job');

/**
 * Models with what Gamer has: the plain prompt box with Ollama as the only engine (no agent roster, so no
 * iterative runs), a native select for the toolbar, a plain licence dialog and tree sections that keep their
 * own open state. The explorer's right-click menu is the frame kit's plain one (`createDialogs().openMenu`).
 */
export const GAMER_MODEL_HOST: ModelHost = {};

/**
 * Games with what Gamer has: the plain popover and toast, no Timeline or folder export — and create and
 * iterate, with Claude Code or Codex on a private per-run MCP server (`gamer-game-agent.tsx`, `main/agent-host.ts`).
 */
export const GAMER_GAME_HOST: GameHost = { agent: GAMER_GAME_AGENT_UI };
