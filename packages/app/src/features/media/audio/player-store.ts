import { create } from 'zustand';

import { useUiStore } from '../../../store/ui-store';

/**
 * The Audio tab's bottom player (Phase 99 Theme E): one `HTMLAudioElement`
 * held by a store, not by a component, so switching Media tabs does not stop
 * playback. Leaving the Media view pauses it — a global mini player is a
 * follow-up, per the phase doc.
 *
 * The queue is the current project's variants. `order` is the play order over
 * that queue: identity, or — with shuffle on — one permutation that stays
 * fixed for the whole pass, with the playing track first so toggling shuffle
 * never jumps away from what is audible.
 */
export type PlayerTrack = { key: string; title: string; url: string; project: string; path: string };
export type LoopMode = 'off' | 'all' | 'one';

export const LOOP_MODES: readonly LoopMode[] = ['off', 'all', 'one'];

/** A restart, not a step back, once this far into a track. */
export const PREV_RESTART_S = 3;

/** The subset of `HTMLAudioElement` the store drives — a fake stands in under vitest. */
export type AudioLike = Pick<
  HTMLAudioElement,
  'src' | 'currentTime' | 'duration' | 'volume' | 'paused' | 'play' | 'pause' | 'load' | 'addEventListener'
>;

export type PlayerState = {
  queue: PlayerTrack[];
  order: number[];
  /** Index into `order`; `-1` when nothing is loaded. */
  pos: number;
  playing: boolean;
  shuffle: boolean;
  loop: LoopMode;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
};

export type PlayerActions = {
  /** Replace the queue and start `startKey`. */
  playQueue: (queue: PlayerTrack[], startKey: string) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  cycleLoop: () => void;
  stop: () => void;
};

export type PlayerStore = PlayerState & PlayerActions;

/** Fisher–Yates over `0..n-1`, with `first` (when given) moved to the front. */
export function buildOrder(n: number, shuffle: boolean, first: number | null, random: () => number = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (!shuffle) return order;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (first !== null && first >= 0 && first < n) {
    order.splice(order.indexOf(first), 1);
    order.unshift(first);
  }
  return order;
}

/**
 * Where playback goes after `pos`. `ended` is the track running out (loop-one
 * repeats it); a Next press always moves on. Past the end, loop-all wraps and
 * loop-off stops (`null`).
 */
export function nextPos(pos: number, length: number, loop: LoopMode, ended: boolean): number | null {
  if (length === 0) return null;
  if (ended && loop === 'one') return pos;
  if (pos + 1 < length) return pos + 1;
  return loop === 'off' ? null : 0;
}

/** Previous: restart past `PREV_RESTART_S`, else step back — wrapping only under loop-all. */
export function prevPos(pos: number, length: number, loop: LoopMode, currentTime: number): number {
  if (length === 0) return -1;
  if (currentTime > PREV_RESTART_S) return pos;
  if (pos > 0) return pos - 1;
  return loop === 'all' ? length - 1 : 0;
}

const initial: PlayerState = {
  queue: [],
  order: [],
  pos: -1,
  playing: false,
  shuffle: false,
  loop: 'off',
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  error: null,
};

export function currentTrack(state: Pick<PlayerState, 'queue' | 'order' | 'pos'>): PlayerTrack | null {
  const index = state.order[state.pos];
  return index === undefined ? null : (state.queue[index] ?? null);
}

export function createPlayerStore(makeAudio: () => AudioLike, random: () => number = Math.random) {
  let audio: AudioLike | null = null;

  return create<PlayerStore>()((set, get) => {
    const element = (): AudioLike => {
      if (audio) return audio;
      const el = makeAudio();
      el.volume = get().volume;
      el.addEventListener('timeupdate', () => set({ currentTime: el.currentTime }));
      el.addEventListener('loadedmetadata', () => set({ duration: Number.isFinite(el.duration) ? el.duration : 0 }));
      el.addEventListener('play', () => set({ playing: true }));
      el.addEventListener('pause', () => set({ playing: false }));
      el.addEventListener('ended', () => advance(true));
      el.addEventListener('error', () => set({ playing: false, error: 'This file could not be played.' }));
      audio = el;
      return el;
    };

    const start = (pos: number) => {
      const state = get();
      const track = currentTrack({ ...state, pos });
      if (!track) return;
      const el = element();
      if (el.src !== track.url) el.src = track.url;
      el.currentTime = 0;
      set({ pos, currentTime: 0, duration: 0, error: null, playing: true });
      void Promise.resolve(el.play()).catch(() => set({ playing: false }));
    };

    const advance = (ended: boolean) => {
      const { pos, order, loop } = get();
      const to = nextPos(pos, order.length, loop, ended);
      if (to === null) {
        element().pause();
        set({ playing: false, currentTime: 0 });
        if (audio) audio.currentTime = 0;
        return;
      }
      start(to);
    };

    return {
      ...initial,
      playQueue: (queue, startKey) => {
        const index = Math.max(0, queue.findIndex((t) => t.key === startKey));
        const order = buildOrder(queue.length, get().shuffle, index, random);
        set({ queue, order });
        start(order.indexOf(index));
      },
      toggle: () => {
        const state = get();
        if (state.pos < 0) return;
        const el = element();
        if (el.paused) {
          set({ playing: true });
          void Promise.resolve(el.play()).catch(() => set({ playing: false }));
        } else {
          el.pause();
          set({ playing: false });
        }
      },
      pause: () => {
        if (!audio) return;
        audio.pause();
        set({ playing: false });
      },
      next: () => advance(false),
      prev: () => {
        const { pos, order, loop, currentTime } = get();
        const to = prevPos(pos, order.length, loop, currentTime);
        if (to < 0) return;
        start(to);
      },
      seek: (seconds) => {
        const el = element();
        const clamped = Math.max(0, Math.min(seconds, get().duration || seconds));
        el.currentTime = clamped;
        set({ currentTime: clamped });
      },
      setVolume: (volume) => {
        const v = Math.max(0, Math.min(1, volume));
        if (audio) audio.volume = v;
        set({ volume: v });
      },
      toggleShuffle: () => {
        const state = get();
        const shuffle = !state.shuffle;
        const playing = state.order[state.pos] ?? null;
        const order = buildOrder(state.queue.length, shuffle, playing, random);
        set({ shuffle, order, pos: playing === null ? -1 : order.indexOf(playing) });
      },
      cycleLoop: () => {
        const loop = LOOP_MODES[(LOOP_MODES.indexOf(get().loop) + 1) % LOOP_MODES.length]!;
        set({ loop });
      },
      stop: () => {
        audio?.pause();
        set({ ...initial, volume: get().volume, shuffle: get().shuffle, loop: get().loop });
      },
    };
  });
}

export const usePlayer = createPlayerStore(() => new Audio());

// Leaving the Media view pauses playback; switching tabs within Media does not.
useUiStore.subscribe((state, prev) => {
  if (prev.activeView === 'media' && state.activeView !== 'media') usePlayer.getState().pause();
});
