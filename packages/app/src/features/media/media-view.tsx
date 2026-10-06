import type { MediaTab } from '@midnite/studio-shared';

import { PageDetachMark } from '../../components/page-detach-mark';
import { useUiStore } from '../../store/ui-store';
import { AudioTab } from './audio/audio-tab';
import { DocsTab } from './doc/docs-tab';
import { GameTab } from './game/game-tab';
import { ImageTab } from './image/image-tab';
import { ModelTab } from './model/model-tab';
import { SpriteTab } from './sprite/sprite-tab';
import { TerrainTab } from './terrain/terrain-tab';
import { MediaTabStrip } from './media-tab-strip';
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
  doc: () => <DocsTab />,
  image: () => <ImageTab />,
  video: () => <VideoTab />,
  audio: () => <AudioTab />,
  model: () => <ModelTab />,
  terrain: () => <TerrainTab />,
  sprite: () => <SpriteTab />,
  game: () => <GameTab />,
};

export function MediaView() {
  const tab = useUiStore((s) => s.mediaTab);
  const setTab = useUiStore((s) => s.setMediaTab);
  useMediaChangedInvalidation();
  const Body = TAB_BODY[tab];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
        <PageDetachMark role="media" />
        <h1 className="text-sm font-semibold">Media</h1>
        <div className="ml-auto shrink-0">
          <MediaTabStrip active={tab} onSelect={setTab} />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Body />
      </div>
    </div>
  );
}
