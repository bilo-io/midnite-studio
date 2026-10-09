// @ts-check
/**
 * Midnite game kit — input replays (engine-free).
 *
 * A replay is frame-indexed, not timed: `{ version: 1, seed, frames, events:
 * [{ f, action, down }] }`, where `f` counts kit steps since boot (what
 * `getState().frame` reports) and `action` is a kit action name, never a key.
 * Playback presses actions on the input map's virtual layer before step `f`
 * runs, so it is frame-exact at 1× and at full speed. Recording watches every
 * input map's sampled actions and writes down each change.
 *
 * The kit loops call `beforeKitStep(stepMs)` once before every fixed step;
 * `installHook` attaches the loop's `step`/`pause`/`resume` so the replayer
 * can drive it (`window.__midnite.replay`).
 */

import { determinism } from './determinism.js';
import { setInputObserver, virtualActions } from './input-map.js';

/**
 * @typedef {{ f: number, action: string, down: boolean }} ReplayEvent
 * @typedef {{ version: 1, seed: number, frames: number, events: ReplayEvent[] }} Replay
 * @typedef {{ step: (n: number) => void, pause: () => void, resume: () => void }} Driver
 */

/** Steps per chunk at full speed: the page yields between chunks so it stays responsive. */
export const REPLAY_CHUNK = 240;

/**
 * Whether a value looks like a replay. The app validates with zod before it sends one;
 * this guards a hand call from the console.
 * @param {unknown} value
 * @returns {value is Replay}
 */
export function isReplay(value) {
  if (!value || typeof value !== 'object') return false;
  const r = /** @type {Record<string, unknown>} */ (value);
  return (
    r.version === 1 &&
    Number.isInteger(r.frames) &&
    Array.isArray(r.events) &&
    r.events.every(
      (e) => e && typeof e === 'object' && Number.isInteger(e.f) && typeof e.action === 'string' && typeof e.down === 'boolean',
    )
  );
}

/**
 * @param {{
 *   actions?: { set: (action: string, down: boolean) => void, clear: () => void },
 *   seed?: () => number,
 *   wait?: () => Promise<void>,
 * }} [options]
 */
export function createReplayer(options = {}) {
  const actions = options.actions ?? virtualActions;
  const currentSeed = options.seed ?? (() => determinism.seed);
  const wait = options.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
  /** Steps taken since boot. */
  let frame = 0;
  /** @type {Driver | null} */
  let driver = null;
  /** @type {{ replay: Replay, events: ReplayEvent[], index: number, done: (() => void)[] } | null} */
  let playing = null;
  /** @type {{ seed: number, events: ReplayEvent[], last: Map<string, boolean> } | null} */
  let recording = null;

  const finish = () => {
    if (!playing) return;
    const done = playing.done;
    playing = null;
    actions.clear();
    for (const resolve of done) resolve();
  };

  /** Press everything due at or before `upTo` (catch-up applies a whole prefix at once). */
  const applyDue = (/** @type {number} */ upTo) => {
    if (!playing) return;
    const { events } = playing;
    while (playing.index < events.length && /** @type {ReplayEvent} */ (events[playing.index]).f <= upTo) {
      const event = /** @type {ReplayEvent} */ (events[playing.index]);
      actions.set(event.action, event.down);
      playing.index += 1;
    }
  };

  const replayer = {
    get frame() {
      return frame;
    },
    get playing() {
      return playing !== null;
    },
    get recording() {
      return recording !== null;
    },
    /** @param {Driver | null} next */
    attach(next) {
      driver = next;
    },
    /** Called by the loop once before every fixed step. */
    beforeStep() {
      applyDue(frame);
      frame += 1;
      if (playing && frame >= playing.replay.frames) finish();
    },
    /**
     * An input map sampled `action` as `down` during the current step.
     * @param {string} action
     * @param {boolean} down
     */
    observe(action, down) {
      if (!recording || playing) return;
      if ((recording.last.get(action) ?? false) === down) return;
      recording.last.set(action, down);
      // Sampled during step `frame`, so it was pressed before that step ran: `f` is one less.
      recording.events.push({ f: Math.max(0, frame - 1), action, down });
    },
    /**
     * Load a replay without stepping. Events before the current frame are applied at once,
     * so an input "held from frame 0" is held now.
     * @param {unknown} replay
     */
    load(replay) {
      if (!isReplay(replay)) return false;
      if (playing) finish();
      const events = [...replay.events].sort((a, b) => a.f - b.f);
      playing = { replay, events, index: 0, done: [] };
      actions.clear();
      applyDue(frame - 1);
      if (frame >= replay.frames) finish();
      return true;
    },
    /**
     * Step (paused) until `target`. Refuses a frame already passed.
     * @param {number} target
     */
    seek(target) {
      if (!driver) return { ok: false, frame, message: 'This game has no step hook.' };
      if (!Number.isInteger(target) || target < frame) {
        return { ok: false, frame, message: `Frame ${target} has already passed (the game is at ${frame}).` };
      }
      driver.pause();
      if (target > frame) driver.step(target - frame);
      return { ok: true, frame };
    },
    /**
     * Play a replay to its end: at 1× on the running loop, or `max` in paused chunks.
     * @param {unknown} replay
     * @param {{ speed?: 1 | 'max' }} [opts]
     * @returns {Promise<{ ok: boolean, frame: number, message?: string }>}
     */
    async play(replay, opts = {}) {
      if (!driver) return { ok: false, frame, message: 'This game has no step hook.' };
      if (!replayer.load(replay)) return { ok: false, frame, message: 'That is not a replay.' };
      const end = /** @type {Replay} */ (replay).frames;
      if (opts.speed === 1) {
        if (!playing) return { ok: true, frame };
        const finished = new Promise((resolve) => playing?.done.push(() => resolve(undefined)));
        driver.resume();
        await finished;
        driver.pause();
        return { ok: true, frame };
      }
      driver.pause();
      while (frame < end) {
        driver.step(Math.min(REPLAY_CHUNK, end - frame));
        if (frame < end) await wait();
      }
      return { ok: true, frame };
    },
    /** Stop playback, or stop recording and answer the replay. */
    stop() {
      if (recording) {
        const { seed, events } = recording;
        recording = null;
        /** @type {Replay} */
        const replay = { version: 1, seed, frames: frame, events };
        return replay;
      }
      finish();
      return null;
    },
    /** Start recording from the current frame. */
    record() {
      if (playing) return false;
      recording = { seed: currentSeed(), events: [], last: new Map() };
      return true;
    },
    status() {
      return {
        frame,
        playing: playing !== null,
        recording: recording !== null,
        end: playing ? playing.replay.frames : null,
      };
    },
  };
  return replayer;
}

/** The page's one replayer: the input maps report to it and the hook exposes it. */
export const replayer = createReplayer();
setInputObserver((action, down) => replayer.observe(action, down));

/**
 * What every kit loop calls once before each fixed step: advance the virtual
 * clock (deterministic mode) and let the replayer press what is due.
 * @param {number} stepMs
 */
export function beforeKitStep(stepMs) {
  determinism.advance(stepMs);
  replayer.beforeStep();
}
