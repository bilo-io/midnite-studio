import type { MediaTab } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { ImageTab } from './image/image-tab';
import { MediaTabStrip } from './media-tab-strip';
import { RepoMediaTab } from './repo-media-tab';
import { useMediaChangedInvalidation } from './use-media';
import { VideoTab } from './video/video-tab';

/**
 * The Media page (Phase 99 Theme A) — Docs, Images, Video and Audio behind
 * one icon tab strip, each tab rendering through `MediaLayout`.
 *
 * `TAB_BODY` is the seam Themes B–E replace: each swaps its own entry for its
 * real tab component. Only the active tab is mounted.
 */
const TAB_BODY: Record<MediaTab, () => React.ReactElement> = {
  doc: () => <RepoMediaTab tab="doc" />,
  image: () => <ImageTab />,
  video: () => <VideoTab />,
  audio: () => <RepoMediaTab tab="audio" />,
};

export function MediaView() {
  const tab = useUiStore((s) => s.mediaTab);
  const setTab = useUiStore((s) => s.setMediaTab);
  useMediaChangedInvalidation();
  const Body = TAB_BODY[tab];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
        <h1 className="text-sm font-semibold">Media</h1>
        <MediaTabStrip active={tab} onSelect={setTab} />
      </div>
      <div className="min-h-0 flex-1">
        <Body />
      </div>
    </div>
  );
}
