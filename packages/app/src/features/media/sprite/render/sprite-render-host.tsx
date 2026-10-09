import type { SpriteRenderRequestEvent } from '@midnite/studio-shared';
import { useEffect } from 'react';

import { bridge } from '../../../../services/bridge';

/**
 * Phase 106 Theme E: the window's side of rendering from 3D. Mounted once at the app root — beside the
 * other global listeners — so a render works whichever view is open, and whether the Sprites tab or
 * an MCP agent started the job (Decision 8: no hidden window).
 *
 * It acknowledges each `mediaSpriteRenderRequest` at once (main fails the job if no window does
 * within 10 s), then imports the three.js renderer lazily — nothing of it loads until the first
 * request. Jobs run one after another: each holds a WebGL context.
 */
export const loadRenderJob = () => import('./render-job');

let queue: Promise<void> = Promise.resolve();

export function handleRenderRequest(event: SpriteRenderRequestEvent): Promise<void> {
  const api = bridge()?.media;
  if (!api) return Promise.resolve();
  void api.sprite.renderReady({ jobId: event.jobId });
  queue = queue.then(async () => {
    try {
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

export function useSpriteRenderHost(): void {
  useEffect(() => {
    const off = bridge()?.media.sprite.onRenderRequest((event) => void handleRenderRequest(event));
    return () => off?.();
  }, []);
}

/** The host as a component, for a tree that prefers one over a hook. */
export function SpriteRenderHost(): null {
  useSpriteRenderHost();
  return null;
}
