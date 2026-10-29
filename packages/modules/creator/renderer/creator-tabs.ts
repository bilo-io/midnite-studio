import { mediaAudioTab } from '@midnite/studio-feature-media-audio/renderer';
import { mediaDocsTab } from '@midnite/studio-feature-media-docs/renderer';
import { mediaImagesTab } from '@midnite/studio-feature-media-images/renderer';
import { mediaVideoTab } from '@midnite/studio-feature-media-video/renderer';
import type { MediaTabDescriptor } from '@midnite/studio-frame';

/**
 * The tabs the Creator module registers with its `MediaShell`, in strip order. Slides is not a tab — a
 * doc's Present button opens its deck.
 */
export const CREATOR_TABS: readonly MediaTabDescriptor[] = [mediaDocsTab, mediaImagesTab, mediaVideoTab, mediaAudioTab];
