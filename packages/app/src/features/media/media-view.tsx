import { AudioHostProvider } from '@midnite/studio-feature-media-audio/renderer';
import { DocsHostProvider } from '@midnite/studio-feature-media-docs/renderer';
import { GameHostProvider } from '@midnite/studio-feature-media-game/renderer';
import { ImagesHostProvider } from '@midnite/studio-feature-media-images/renderer';
import { MapHostProvider } from '@midnite/studio-feature-media-map/renderer';
import { SpriteHostProvider } from '@midnite/studio-feature-media-sprite/renderer';
import { TerrainHostProvider } from '@midnite/studio-feature-media-terrain/renderer';
import { VideoHostProvider } from '@midnite/studio-feature-media-video/renderer';
import { MediaShell } from '@midnite/studio-feature-media-core/renderer';
import type { ComponentType, ReactNode } from 'react';

import { STUDIO_AUDIO_HOST } from '../../compose/media-audio-host';
import { STUDIO_DOCS_HOST } from '../../compose/media-docs-host';
import { STUDIO_GAME_HOST } from '../../compose/media-game-host';
import { STUDIO_IMAGES_HOST } from '../../compose/media-images-host';
import { STUDIO_MAP_HOST } from '../../compose/media-map-host';
import { STUDIO_SPRITE_HOST } from '../../compose/media-sprite-host';
import { STUDIO_TERRAIN_HOST } from '../../compose/media-terrain-host';
import { STUDIO_VIDEO_HOST } from '../../compose/media-video-host';
import { STUDIO_MEDIA_TABS } from '../../compose/media-tabs';

type HostEntry = { Provider: ComponentType<{ host: never; children: ReactNode }>; host: unknown };

/** Pairs a feature's host provider with Studio's adapter, checked against each other, then erased to a list entry. */
const hostEntry = <H,>(Provider: ComponentType<{ host: H; children: ReactNode }>, host: H): HostEntry => ({
  Provider: Provider as HostEntry['Provider'],
  host,
});

/** One line per composed tab feature (Phase 113 Theme S) — outermost first. */
const TAB_HOSTS: readonly HostEntry[] = [
  hostEntry(DocsHostProvider, STUDIO_DOCS_HOST),
  hostEntry(ImagesHostProvider, STUDIO_IMAGES_HOST),
  hostEntry(AudioHostProvider, STUDIO_AUDIO_HOST),
  hostEntry(VideoHostProvider, STUDIO_VIDEO_HOST),
  hostEntry(MapHostProvider, STUDIO_MAP_HOST),
  hostEntry(GameHostProvider, STUDIO_GAME_HOST),
  hostEntry(TerrainHostProvider, STUDIO_TERRAIN_HOST),
  hostEntry(SpriteHostProvider, STUDIO_SPRITE_HOST),
];

/**
 * The hosts of the media tab features Studio composes (Phase 113 Themes Q and S),
 * nested. Here rather than in `StudioProviders` because they carry Studio's
 * AI chrome, and the Media view is a lazy chunk; a test that renders a tab
 * on its own wraps it in this too.
 */
export function StudioMediaTabHosts({ children }: { children: ReactNode }) {
  return TAB_HOSTS.reduceRight<ReactNode>(
    (inner, { Provider, host }) => <Provider host={host as never}>{inner}</Provider>,
    children,
  );
}

/**
 * Studio's Media page (Phase 99 Theme A) — since Phase 113 Theme Q it is
 * media-core's `MediaShell` over Studio's registry: all nine tabs, in the
 * order they have always had, each rendering through `MediaLayout`.
 */
export function MediaView() {
  return (
    <StudioMediaTabHosts>
      <MediaShell tabs={STUDIO_MEDIA_TABS} />
    </StudioMediaTabHosts>
  );
}
