import { useTerrainOpenListener } from '@midnite/studio-feature-media-terrain/renderer';
import type { TerrainOpenEvent } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';

/** The part of `terrain_open` only the app shell can do: select the repository and bring the Terrain tab up. */
function showTerrain(event: TerrainOpenEvent): void {
  const ui = useUiStore.getState();
  if (ui.selectedRepoId !== event.repoId) ui.selectRepo(event.repoId);
  ui.openMedia('terrain');
}

/** Mounted once by the app shell (main window only) — an agent's `terrain_open` shows a terrain. */
export function useStudioTerrainOpenListener(): void {
  useTerrainOpenListener(showTerrain);
}
