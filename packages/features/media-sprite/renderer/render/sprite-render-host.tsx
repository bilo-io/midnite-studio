import { bridge } from '@midnite/studio-frame';
import type { SpriteRenderRequestEvent } from '@midnite/studio-shared';
import { useEffect } from 'react';

import type { SpriteRenderJobModule } from '../host';

/**
 * Phase 106 Theme E: the window's side of rendering from 3D. Mounted once at the app root — beside the
 * other global listeners — so a render works whichever view is open, and whether the Sprites tab or
 * an MCP agent started the job (Decision 8: no hidden window).
 *
 * It acknowledges each `mediaSpriteRenderRequest` at once (main fails the job if no window does
 * within 10 s), then imports the app's three.js render job lazily — nothing of it loads until the first
 * request. The job itself is the composing app's (it builds the scene from the Models tab's rig code,
 * which a feature may not import): an app that supplies none answers the request with an error so the
 * job fails plainly instead of timing out. Jobs run one after another: each holds a WebGL context.
 */
export type LoadRenderJob = () => Promise<SpriteRenderJobModule>;

let queue: Promise<void> = Promise.resolve();

export function handleRenderRequest(event: SpriteRenderRequestEvent, loadRenderJob?: LoadRenderJob): Promise<void> {
  const api = bridge()?.media;
  if (!api) return Promise.resolve();
  void api.sprite.renderReady({ jobId: event.jobId });
  queue = queue.then(async () => {
    try {
      if (!loadRenderJob) throw new Error('Rendering from 3D needs the Models tab, which this app does not have.');
      const { runRenderJob } = await loadRenderJob();
      await runRenderJob(event, {
        readText: async (req) => {
          const read = await api.file.read({ repoId: req.repoId, tab: 'model', project: req.project, path: req.path });
          return read.ok ? read.value : null;
        },
        post: (req) => api.sprite.renderFrames(req),
      });
    } catch (error) {
      await api.sprite.renderFrames({ jobId: event.jobId, frames: [], done: true, error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    }
  });
  return queue;
}

/** Mount once at the app root. `loadRenderJob` is the app's lazy import of its render job. */
export function useSpriteRenderHost(loadRenderJob?: LoadRenderJob): void {
  useEffect(() => {
    const off = bridge()?.media.sprite.onRenderRequest((event) => void handleRenderRequest(event, loadRenderJob));
    return () => off?.();
  }, [loadRenderJob]);
}

/** The host as a component, for a tree that prefers one over a hook. */
export function SpriteRenderHost({ loadRenderJob }: { loadRenderJob?: LoadRenderJob }): null {
  useSpriteRenderHost(loadRenderJob);
  return null;
}
