/**
 * The timeline player's state (Phase 125 Theme D), pure: a clip's playhead, transport flags and in/out
 * preview range, moved by reducer actions. The UI owns the clock (an animation-frame loop that dispatches
 * `tick`); nothing here reads time, so every transition is testable with plain numbers.
 */
export const PLAYER_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
export const DEFAULT_FPS = 30;

export type PlayerState = {
  /** Seconds from the clip start. */
  time: number;
  playing: boolean;
  loop: boolean;
  /** 0.25–2. */
  speed: number;
  /** The preview range, seconds; `0` and `duration` when no range is set. */
  inPoint: number;
  outPoint: number;
  duration: number;
  fps: number;
};

export type PlayerAction =
  | { type: 'load'; duration: number; fps?: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'scrub'; time: number }
  | { type: 'step'; frames: number }
  | { type: 'setIn'; time?: number }
  | { type: 'setOut'; time?: number }
  | { type: 'clearRange' }
  | { type: 'setLoop'; loop: boolean }
  | { type: 'toggleLoop' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'tick'; dt: number };

export const timeToFrame = (time: number, fps: number): number => Math.round(time * fps);
export const frameToTime = (frame: number, fps: number): number => frame / fps;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const safeFps = (fps: number | undefined): number => (fps !== undefined && Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS);

export function initialPlayer(duration = 0, fps?: number): PlayerState {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return { time: 0, playing: false, loop: true, speed: 1, inPoint: 0, outPoint: d, duration: d, fps: safeFps(fps) };
}

/** One frame in seconds, the smallest range the in/out handles may leave. */
const frameLength = (state: PlayerState): number => 1 / state.fps;

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'load':
      return initialPlayer(action.duration, action.fps);
    case 'play': {
      if (state.duration <= 0) return state;
      // Playing from outside the range (or from the very end) starts at the range's head.
      const time = state.time < state.inPoint || state.time >= state.outPoint ? state.inPoint : state.time;
      return { ...state, playing: true, time };
    }
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'toggle':
      return playerReducer(state, { type: state.playing ? 'pause' : 'play' });
    case 'scrub':
      return { ...state, playing: false, time: clamp(action.time, 0, state.duration) };
    case 'step': {
      const frame = timeToFrame(state.time, state.fps) + Math.trunc(action.frames);
      return { ...state, playing: false, time: clamp(frameToTime(frame, state.fps), 0, state.duration) };
    }
    case 'setIn': {
      const at = clamp(action.time ?? state.time, 0, state.outPoint - frameLength(state));
      return { ...state, inPoint: Math.max(0, at) };
    }
    case 'setOut': {
      const at = clamp(action.time ?? state.time, state.inPoint + frameLength(state), state.duration);
      return { ...state, outPoint: Math.max(state.inPoint, at) };
    }
    case 'clearRange':
      return { ...state, inPoint: 0, outPoint: state.duration };
    case 'setLoop':
      return { ...state, loop: action.loop };
    case 'toggleLoop':
      return { ...state, loop: !state.loop };
    case 'setSpeed':
      return { ...state, speed: clamp(action.speed, PLAYER_SPEEDS[0], PLAYER_SPEEDS[PLAYER_SPEEDS.length - 1]!) };
    case 'tick': {
      if (!state.playing) return state;
      const next = state.time + action.dt * state.speed;
      if (next < state.outPoint) return { ...state, time: Math.max(next, state.inPoint) };
      const span = state.outPoint - state.inPoint;
      if (state.loop && span > 0) return { ...state, time: state.inPoint + ((next - state.inPoint) % span) };
      return { ...state, time: state.outPoint, playing: false };
    }
  }
}

/** What a key does on the focused timeline, or `null` for a key it leaves alone. Nothing here joins `COMMANDS`. */
export function timelineKey(key: string): PlayerAction | null {
  switch (key) {
    case ' ':
      return { type: 'toggle' };
    case 'ArrowLeft':
      return { type: 'step', frames: -1 };
    case 'ArrowRight':
      return { type: 'step', frames: 1 };
    case '[':
      return { type: 'setIn' };
    case ']':
      return { type: 'setOut' };
    case 'l':
    case 'L':
      return { type: 'toggleLoop' };
    default:
      return null;
  }
}

/** `00:12 / 00:30`-style readout: seconds with centiseconds plus the 0-based frame. */
export function timeReadout(state: Pick<PlayerState, 'time' | 'fps' | 'duration'>): string {
  const frames = timeToFrame(state.duration, state.fps);
  return `${state.time.toFixed(2)}s · frame ${timeToFrame(state.time, state.fps)} / ${frames}`;
}
