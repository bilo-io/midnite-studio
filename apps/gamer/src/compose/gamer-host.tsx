import { createStandaloneMediaHost, type MediaHost } from '@midnite/studio-feature-media-core/renderer';
import type { GameHost } from '@midnite/studio-feature-media-game/renderer';
import { useMapFocus, type MapHost } from '@midnite/studio-feature-media-map/renderer';
import type { SpriteHost } from '@midnite/studio-feature-media-sprite/renderer';
import type { TerrainHost } from '@midnite/studio-feature-media-terrain/renderer';
import type { MediaTab } from '@midnite/studio-shared';

/**
 * The host ports Gamer implements (Phase 113 Theme S).
 *
 * Gamer has no repository list: its media lives under one root that main registers as the repository
 * `gamer` (`main/context.ts`), so the media shell is scoped to that id. Its state — the tab it was on,
 * pane widths — persists in Gamer's own localStorage, never in Studio's. The four tab features take plain
 * defaults for everything else: no terminal, no agents, no Timeline, no image provider, no 3D renderer
 * (those arrive with the Model tab and the vault in later slices), so those controls are simply not offered.
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

/** Sprites with what Gamer has: the plain composer, no rigged models, no 3D render window. */
export const GAMER_SPRITE_HOST: SpriteHost = {};

/** Games with what Gamer has: the plain popover and toast, no agent panel, Timeline or folder export. */
export const GAMER_GAME_HOST: GameHost = {};
