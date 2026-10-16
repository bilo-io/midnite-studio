import type { ImagesHost } from '@midnite/studio-feature-media-images/renderer';
import { useMemo, type RefObject } from 'react';

import { useDismiss } from '../components/use-dismiss';
import { useFocusTrap } from '../components/use-focus-trap';
import { CreatePanel } from '../features/media/image/create-panel';
import { previewKindForFile } from '../lib/languages';
import { useRepoFiles } from '../services/queries';

/**
 * Studio's side of the Images feature's host port (Phase 113 Theme Q).
 *
 * The create panel is Studio's own (`features/media/image/create-panel.tsx`:
 * the ai-thread composer, provider picker and voice). The lightbox joins
 * Studio's dismiss stack — so it counts as an occluder and a browser pane
 * underneath hides — and its focus trap. "All images in repo" reads the
 * repository's file list, filtered to what previews as an image.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by
 * `StudioProviders`, for the same entry-chunk reason as the Docs host.
 */
function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useDismiss(true, onClose, { layer: 'dialog' });
  useFocusTrap(ref, true);
}

function useRepoImagePaths(repoId: string, enabled: boolean): readonly string[] | undefined {
  const files = useRepoFiles(repoId, null, undefined, { enabled });
  return useMemo(
    () => files.data?.files.filter((path) => previewKindForFile(path) === 'image'),
    [files.data],
  );
}

export const STUDIO_IMAGES_HOST = {
  CreatePanel,
  useModal,
  useRepoImagePaths,
} satisfies ImagesHost;
