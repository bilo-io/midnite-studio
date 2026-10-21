import { mediaVideoMain } from '@midnite/studio-feature-media-video/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { resolveWorkdir } from '../repo-registry';
import { mediaVideoTemplateRoot } from '../template-path';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';

/**
 * Video Studio (Phase 44 Theme H) — global CRUD over discovered projects, the
 * studio lifecycle, and the render queue — composed here from the `media-video`
 * feature (Phase 113 Theme Q). `configureVideo` (main/index.ts) wires its
 * settings store, window events and OS handoffs; this registers the channels with
 * Studio's two lookups: the repo registry and the packaged template tree.
 */
export function registerVideoHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('video never trashes through this context')),
  };
  mediaVideoMain.register(ctx, { resolveWorkdir, templateRoot: mediaVideoTemplateRoot });
}
