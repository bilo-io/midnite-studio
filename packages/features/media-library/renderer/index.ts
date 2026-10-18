import { LuLibrary } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { LibraryTab } from './library-tab';

/**
 * Media ▸ Library's renderer half (Phase 113 Theme R). It never imports media-core: the layout and
 * accordion come through the frame's `useMediaKit()`, which the app's media shell installs, and what
 * differs per app (a richer player, the key field) comes through {@link LibraryHost}.
 */
export { mediaLibraryManifest, type MediaLibraryManifest } from '../manifest';
export {
  LibraryHostProvider,
  useLibraryHost,
  type LibraryHost,
  type LibraryPlayerProps,
} from './host';
export { LibraryPlayer } from './library-player';
export { LIBRARY_KEYS, useLibraryItems, useLibraryRoots, useLibrarySettings } from './use-library';

/** The Library tab, for an app's media tab registry. */
export const mediaLibraryTab = {
  id: 'library',
  label: 'Library',
  icon: LuLibrary,
  Component: LibraryTab,
} as const satisfies MediaTabDescriptor;
