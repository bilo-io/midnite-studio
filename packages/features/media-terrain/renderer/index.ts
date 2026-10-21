import { LuMountain } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { TerrainTab } from './terrain-tab';

/**
 * Media ▸ Terrain's renderer half (Phase 113 Theme S). It never imports media-core: the layout, explorer
 * chrome and data hooks come through the frame's `useMediaKit()`, which the app's `MediaShell` installs, and
 * what differs per app — "Show on map", the modal and dropdown chrome, the heightmap prompt — comes through
 * {@link TerrainHost}. It never imports Maps either: the hand-off is the host's `showOnMap`.
 */
export { mediaTerrainManifest, type MediaTerrainManifest } from '../manifest';
export {
  TerrainHostProvider,
  useTerrainHost,
  type HeightmapPromptDialogProps,
  type TerrainChrome,
  type TerrainHost,
  type TerrainMapFocus,
  type TerrainModalProps,
  type TerrainSelectOption,
  type TerrainSelectProps,
} from './host';
export { useTerrainOpenListener, useTerrainOpenRequest } from './use-terrain-agent-events';
export { NoHeightmapDialog } from './no-heightmap-dialog';
export { TerrainPanel } from './terrain-panel';

/** The Terrain tab, for an app's `MediaShell` registry. */
export const mediaTerrainTab = {
  id: 'terrain',
  label: 'Terrain',
  icon: LuMountain,
  Component: TerrainTab,
} as const satisfies MediaTabDescriptor;
