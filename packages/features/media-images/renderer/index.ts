import { LuImage } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { ImageTab } from './image-tab';

/**
 * Media ▸ Images' renderer half (Phase 113 Theme Q). It never imports
 * media-core: the layout, explorer and data hooks come through the frame's
 * `useMediaKit()`, which the app's `MediaShell` installs, and what differs per
 * app comes through {@link ImagesHost}.
 */
export { mediaImagesManifest, type MediaImagesManifest } from '../manifest';
export { ImagesHostProvider, useImagesHost, type ImageCreatePanelProps, type ImagesHost } from './host';
export { BasicCreatePanel } from './basic-create-panel';
export {
  createPanelReducer,
  generateBlockedReason,
  initialCreateState,
  type CreateAction,
  type CreateState,
} from './create-panel-state';
export { DEFAULT_IMAGE_PROJECT } from './image-tab';
export { Lightbox } from './lightbox';
export type { GalleryImage } from './masonry-gallery';
export {
  IMAGE_KEYS,
  useImageGeneration,
  useImagePrefs,
  useImageProviders,
  useImageSecretHas,
  useSetImageSecret,
  type PendingGeneration,
} from './use-images';

/** The Images tab, for an app's `MediaShell` registry. */
export const mediaImagesTab = {
  id: 'image',
  label: 'Images',
  icon: LuImage,
  Component: ImageTab,
} as const satisfies MediaTabDescriptor;
