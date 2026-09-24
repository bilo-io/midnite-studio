import { useEffect, useRef, useState } from 'react';

import { motionMs } from '../../../components/use-reveal';
import { useWindowFocused } from '../../../lib/use-window-focus';
import { getActiveStream } from '../recorder';
import { companionTtsSpeaker } from '../speaker';
import { getCompanionAudio } from './context';

/**
 * Two small inline level meters for the companion input bar (Ad Hoc:
 * companion input + voice improvements) — one for the mic while the user is
 * being heard, one for the companion's own reply while it plays.
 *
 * Both read a Web Audio `AnalyserNode`'s time-domain data into a fixed-length
 * array of `WAVEFORM_BAR_COUNT` 0..1 levels, sampled on `requestAnimationFrame`
 * only while genuinely `active`: `useLevelBars` below starts the loop on the
 * `active` transition to `true` and tears everything down again the moment it
 * goes `false` — no rAF runs, and no analyser stays connected, for a bar
 * nobody can see, matching `audio/context.ts`'s own "the cheapest work is the
 * work that is not scheduled" rule.
 *
 * **The source is polled, not captured once.** `startRecording()`
 * (`recorder.ts`) opens the microphone asynchronously — `getUserMedia`
 * resolves after the render that flips `active` true has already committed —
 * so `useMicLevelBars` calls `getActiveStream()` fresh on every frame until
 * it stops returning `null`, rather than reading it once at the moment the
 * loop starts and giving up. The same shape covers the companion-speaking
 * meter's own startup order against `getCompanionAudio()`. Retrying is cheap
 * here specifically because each `open()` below returns `null` **before**
 * constructing anything when its source is not yet available — there is
 * nothing to leak on a failed attempt.
 *
 * **Reduced motion.** `motionMs()` (`components/use-reveal.ts`) is this
 * repo's one resolved answer to "is motion on" — `prefers-reduced-motion`
 * folded through `appearance-store.ts`'s explicit override and published as
 * `html[data-motion]`, the paired guard every other animated surface here
 * already reads. Under it, `useLevelBars` never starts the rAF loop at all:
 * `active` still renders a small **static** filled bar (there is signal to
 * show — the mic is open, the companion is talking — just no continuous
 * motion drawing it).
 *
 * **Window focus.** `useWindowFocused()` gates the same loop — sampling
 * pauses the instant the window blurs and resumes on refocus, without
 * tearing down the analyser (a blur is usually momentary, and reconnecting
 * one is not free).
 *
 * **The companion's own playback has one real, stated limitation.** Only the
 * local/offline TTS engine (`speaker.ts`'s `createLocalSpeaker`) plays
 * through the shared `AudioContext`/master gain (`audio/context.ts`) an
 * `AnalyserNode` can tap. `speechSynthesis` (the system voice) renders
 * through the OS's own audio pipeline — Chromium exposes no PCM for it to
 * page script at all, so there is nothing to attach to while that engine is
 * the one talking. `useCompanionSpeakingLevelBars` reads
 * `companionTtsSpeaker.activeEngine` and, for `'system'`, never returns a
 * source — which (like reduced motion) renders the static "active" frame
 * rather than nothing: real samples for the local engine, an honest "the
 * companion is talking" indicator for the system one, never fabricated data.
 */

export const WAVEFORM_BAR_COUNT = 9;
export type LevelBars = readonly number[];

const SILENT_BARS: LevelBars = new Array(WAVEFORM_BAR_COUNT).fill(0);
/** The "something is happening, no per-sample signal to draw" frame — filled, not moving. */
const STATIC_ACTIVE_BARS: LevelBars = new Array(WAVEFORM_BAR_COUNT).fill(0.35);

/** Downsample an analyser's time-domain buffer into `WAVEFORM_BAR_COUNT` 0..1 peaks. */
function sampleAnalyser(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): LevelBars {
  analyser.getByteTimeDomainData(buffer);
  const bars: number[] = [];
  const chunk = Math.max(1, Math.floor(buffer.length / WAVEFORM_BAR_COUNT));
  for (let bar = 0; bar < WAVEFORM_BAR_COUNT; bar += 1) {
    let peak = 0;
    const end = Math.min(buffer.length, (bar + 1) * chunk);
    for (let i = bar * chunk; i < end; i += 1) {
      const centered = Math.abs((buffer[i] ?? 128) - 128) / 128;
      if (centered > peak) peak = centered;
    }
    bars.push(peak);
  }
  return bars;
}

/** What `useLevelBars` needs from a source — an analyser to sample, and how to let it go. */
type AnalyserHandle = { analyser: AnalyserNode; release: () => void } | null;

/**
 * The shared rAF-driven sampling loop. `open` is retried every frame (see
 * the module doc) until it stops returning `null` or `active` goes false;
 * `release()` runs once, on whichever comes first — the effect's own
 * cleanup covers both the "never opened" and the "opened, then closed" case.
 */
function useLevelBars(active: boolean, open: () => AnalyserHandle): LevelBars {
  const [bars, setBars] = useState<LevelBars>(SILENT_BARS);
  const windowFocused = useWindowFocused();
  const reducedMotion = motionMs() === 0;

  const frameRef = useRef<number | null>(null);
  // Mutable mirrors, read from inside the rAF closure without making either
  // a dependency of the effect below — the loop already reschedules every
  // frame regardless, and making `open` one would tear down and reopen the
  // analyser on every render instead of once per `active` edge.
  const windowFocusedRef = useRef(windowFocused);
  windowFocusedRef.current = windowFocused;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!active) {
      setBars(SILENT_BARS);
      return undefined;
    }
    if (reducedMotion) {
      setBars(STATIC_ACTIVE_BARS);
      return undefined;
    }

    let handle: AnalyserHandle = null;
    let buffer: Uint8Array<ArrayBuffer> | null = null;

    const tick = (): void => {
      if (!handle) {
        handle = openRef.current();
        if (handle) {
          handle.analyser.fftSize = 256;
          buffer = new Uint8Array(handle.analyser.frequencyBinCount);
        }
      }
      if (windowFocusedRef.current) {
        setBars(handle && buffer ? sampleAnalyser(handle.analyser, buffer) : STATIC_ACTIVE_BARS);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      handle?.release();
      setBars(SILENT_BARS);
    };
    // `open` is intentionally not a dependency — it is read through the ref
    // above so only `active`/`reducedMotion` restart this effect.
  }, [active, reducedMotion]);

  return bars;
}

/**
 * The mic meter: an `AnalyserNode` on the live capture stream while the
 * server STT engine is recording. `active` is the input bar's own
 * "listening" flag (held mic button/Space, or toggle-mode's own state) — the
 * stream itself is polled live from `recorder.ts`, never passed in, for the
 * async-open reason the module doc gives. Renders the static "active" frame
 * the whole time the Web Speech engine is selected — `SpeechRecognition`
 * manages its own audio internally and exposes no `MediaStream` to tap at
 * all — rather than a real level.
 */
export function useMicLevelBars(active: boolean): LevelBars {
  return useLevelBars(active, () => {
    const stream = getActiveStream();
    if (stream === null || typeof AudioContext !== 'function') return null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    source.connect(analyser);
    // Never connected to `ctx.destination` — this graph exists to read
    // levels, not to play the mic back over the speakers.
    return {
      analyser,
      release: () => {
        source.disconnect();
        analyser.disconnect();
        void ctx.close();
      },
    };
  });
}

/**
 * The companion-speaking meter. See the module doc's "one real, stated
 * limitation" note for why this is exact samples for the local TTS engine
 * and the static "active" frame for the system one.
 */
export function useCompanionSpeakingLevelBars(active: boolean): LevelBars {
  return useLevelBars(active, () => {
    if (companionTtsSpeaker.activeEngine !== 'local') return null;
    const audio = getCompanionAudio();
    if (!audio) return null;
    const analyser = audio.ctx.createAnalyser();
    // Tapped downstream of the master gain, upstream of nothing further —
    // this node never connects to `ctx.destination` itself, so it adds no
    // second path to the speakers and cannot double the level.
    audio.master.connect(analyser);
    return {
      analyser,
      release: () => {
        try {
          audio.master.disconnect(analyser);
        } catch {
          // `stopCompanionAudio()` may have already rebuilt `master` out from
          // under this tap (a cancel mid-utterance) — nothing left to undo.
        }
      },
    };
  });
}
