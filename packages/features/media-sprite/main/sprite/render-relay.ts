import {
  failure,
  ok,
  SPRITE_RENDER_NO_WINDOW,
  SPRITE_RENDER_READY_MS,
  type GitOpResult,
  type SpriteRenderedFrame,
  type SpriteRenderFramesRequest,
  type SpriteRenderRequestEvent,
} from '@midnite/studio-shared';

/**
 * Phase 106 Theme E: the main-process half of rendering from 3D. Rendering needs WebGL and three's
 * materials, which live in the renderer, so main hands each job to the open window
 * (`mediaSpriteRenderRequest`) and the window's lazy `SpriteRenderHost` posts frames back in batches
 * (`mediaSpriteRenderFrames`). There is no hidden window (Decision 8): it would load a second full
 * renderer for a path the user's own window already serves.
 *
 * - The window must acknowledge (`mediaSpriteRenderReady`, or a first batch) within
 *   {@link SPRITE_RENDER_READY_MS}; otherwise — or when there is no window to ask — the job fails with
 *   {@link SPRITE_RENDER_NO_WINDOW}. Over MCP that is exactly the result the agent gets.
 * - A batch is answered only once every frame in it went through `onFrame` (the frame pipeline), so a
 *   renderer that awaits each batch can never outrun main.
 * - Cancelling (the job's signal) drops the job; the renderer's next batch is refused and it stops.
 */
export type RenderRelayDeps = {
  /** Sends the request to a window; `false` when there is none. */
  send: (event: SpriteRenderRequestEvent) => boolean;
  readyMs?: number;
};

export type RenderHandlers = {
  signal: AbortSignal;
  onFrame: (frame: SpriteRenderedFrame) => Promise<void>;
  onBatch?: (batch: Pick<SpriteRenderFramesRequest, 'total' | 'notes' | 'clips'>) => void | Promise<void>;
};

type Pending = {
  ready: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  handlers: RenderHandlers;
  settle: (error?: Error) => void;
  /** Batches are processed one after another even if the renderer posts the next too early. */
  chain: Promise<unknown>;
};

export const RENDER_JOB_GONE = 'This render job is no longer running.';

export function createRenderRelay(deps: RenderRelayDeps) {
  const jobs = new Map<string, Pending>();
  const readyMs = deps.readyMs ?? SPRITE_RENDER_READY_MS;

  function render(event: SpriteRenderRequestEvent, handlers: RenderHandlers): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (handlers.signal.aborted) return reject(new Error('cancelled'));
      const pending: Pending = {
        ready: false,
        timer: null,
        handlers,
        chain: Promise.resolve(),
        settle: (error) => {
          if (jobs.get(event.jobId) !== pending) return;
          jobs.delete(event.jobId);
          if (pending.timer) clearTimeout(pending.timer);
          handlers.signal.removeEventListener('abort', onAbort);
          if (error) reject(error);
          else resolve();
        },
      };
      const onAbort = () => pending.settle(new Error('cancelled'));
      handlers.signal.addEventListener('abort', onAbort);
      jobs.set(event.jobId, pending);
      pending.timer = setTimeout(() => {
        if (!pending.ready) pending.settle(new Error(SPRITE_RENDER_NO_WINDOW));
      }, readyMs);
      let sent = false;
      try {
        sent = deps.send(event);
      } catch {
        sent = false;
      }
      if (!sent) pending.settle(new Error(SPRITE_RENDER_NO_WINDOW));
    });
  }

  function markReady(pending: Pending): void {
    pending.ready = true;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
  }

  function ready(jobId: string): GitOpResult {
    const pending = jobs.get(jobId);
    if (!pending) return failure(RENDER_JOB_GONE);
    markReady(pending);
    return ok();
  }

  function frames(req: SpriteRenderFramesRequest): Promise<GitOpResult> {
    const pending = jobs.get(req.jobId);
    if (!pending) return Promise.resolve(failure(RENDER_JOB_GONE));
    markReady(pending);
    const run = pending.chain.then(async (): Promise<GitOpResult> => {
      if (jobs.get(req.jobId) !== pending) return failure(RENDER_JOB_GONE);
      try {
        if (req.total !== undefined || req.notes || req.clips) await pending.handlers.onBatch?.({ total: req.total, notes: req.notes, clips: req.clips });
        for (const frame of req.frames) {
          if (jobs.get(req.jobId) !== pending) return failure(RENDER_JOB_GONE);
          await pending.handlers.onFrame(frame);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pending.settle(new Error(message));
        return failure(message);
      }
      if (req.error) {
        pending.settle(new Error(req.error));
        return ok();
      }
      if (req.done) pending.settle();
      return ok();
    });
    pending.chain = run;
    return run;
  }

  return { render, ready, frames, get pending() { return jobs.size; } };
}

export type RenderRelay = ReturnType<typeof createRenderRelay>;
