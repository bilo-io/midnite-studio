import type { SpriteLoop } from '@midnite/studio-shared';

/**
 * The animation previewer's timing (Phase 106 Theme G), as a pure state machine so it can be
 * stepped by `requestAnimationFrame` in the app and by fake time in a test.
 *
 * `step(dtMs)` advances by whole frames at the clip's fps (or the override) and returns the frame
 * index. `loop` wraps, `once` stops on the last frame (and stops playing), `ping-pong` bounces
 * between the ends without repeating them.
 */
export type PreviewClip = { frames: number; fps: number; loop: SpriteLoop };

export type PreviewClock = {
  readonly frame: number;
  /** False once a `once` clip has reached its last frame. */
  readonly running: boolean;
  step: (dtMs: number) => number;
  seek: (frame: number) => number;
  /** Back to frame 0, running. */
  reset: () => void;
};

export function previewClock(clip: PreviewClip, fpsOverride?: number | null): PreviewClock {
  const count = Math.max(0, Math.floor(clip.frames));
  const fps = Math.max(0.1, fpsOverride ?? clip.fps);
  const frameMs = 1000 / fps;
  let frame = 0;
  let elapsed = 0;
  let direction = 1;
  let running = true;

  const advance = (): void => {
    if (count <= 1) return;
    if (clip.loop === 'loop') {
      frame = (frame + 1) % count;
    } else if (clip.loop === 'once') {
      frame = Math.min(count - 1, frame + 1);
      if (frame === count - 1) running = false;
    } else {
      if (frame + direction < 0 || frame + direction >= count) direction = -direction;
      frame += direction;
    }
  };

  return {
    get frame() {
      return frame;
    },
    get running() {
      return running;
    },
    step(dtMs) {
      if (!running || count === 0) return frame;
      elapsed += Math.max(0, dtMs);
      while (elapsed >= frameMs && running) {
        elapsed -= frameMs;
        advance();
      }
      return frame;
    },
    seek(target) {
      frame = count === 0 ? 0 : Math.max(0, Math.min(count - 1, Math.round(target)));
      elapsed = 0;
      if (clip.loop === 'once') running = frame < count - 1;
      return frame;
    },
    reset() {
      frame = 0;
      elapsed = 0;
      direction = 1;
      running = true;
    },
  };
}
