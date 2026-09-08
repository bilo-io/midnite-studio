import { COMPANION_AUDIO_IDLE_SUSPEND_MS } from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';

/**
 * The companion's one `AudioContext`, and the reason it is usually asleep
 * (Phase 79 Theme G).
 *
 * Everything audible in this theme — the whistle, the elevator loop — is
 * **synthesised**, per the phase's "no audio assets" guardrail. That means an
 * `AudioContext`, and an `AudioContext` means an audio thread, which is a
 * running cost on a feature that is off by default and silent almost all of
 * the time. So:
 *
 * - **Created lazily**, on the first sound. A user who never hears the
 *   companion never pays for one.
 * - **Suspended after 60 s idle**, not closed. Suspending parks the audio
 *   thread; closing is irreversible per context, so the next whistle would pay
 *   for a fresh context *and* a fresh graph. This is the difference the PR's
 *   idle-CPU number is measuring.
 * - **One master gain** every source routes through, so "Companion volume" is
 *   one node and `stopCompanionAudio()` is one disconnect rather than a
 *   registry of live oscillators.
 *
 * `Phase 36`'s visibility gates are the precedent for the shape: the cheapest
 * work is the work that is not scheduled.
 */

export type CompanionAudio = {
  ctx: AudioContext;
  /** Every source connects here, never to `ctx.destination` directly. */
  master: GainNode;
};

/** Injected so the tests need no Web Audio implementation at all. */
export type AudioContextDeps = {
  create: (() => AudioContext) | null;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (handle: number) => void;
};

export const defaultAudioDeps = (): AudioContextDeps => ({
  create:
    typeof AudioContext === 'function'
      ? () => new AudioContext({ latencyHint: 'playback' })
      : null,
  setTimer: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  clearTimer: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
});

let deps: AudioContextDeps = defaultAudioDeps();
let audio: CompanionAudio | null = null;
let idleTimer: number | null = null;
let volume = 1;

/**
 * The dev-only proof that the suspend actually happens.
 *
 * The phase's verification item asks for it "asserted via a dev-only log line
 * behind `MSTUDIO_PERF=1`" — because the interesting claim (a silent companion
 * costs no audio thread) is invisible from inside the app and the idle-CPU
 * script watches from outside. Gated on the same `perf.enabled` flag
 * `lib/perf.ts` reads, so an ordinary run costs one property read.
 */
function perfLog(message: string): void {
  if (bridge()?.perf?.enabled !== true) return;
  // eslint-disable-next-line no-console -- the perf scripts read main's stdout; this is the seam.
  console.info(`[companion-audio] ${message}`);
}

const clearIdleTimer = (): void => {
  if (idleTimer !== null) deps.clearTimer(idleTimer);
  idleTimer = null;
};

/**
 * Restart the idle countdown.
 *
 * Called on every sound rather than on a state change, because "idle" here
 * means "nothing has been played", and the companion can sit in `handoff` for
 * minutes between whistles.
 */
export function noteCompanionAudioActivity(): void {
  clearIdleTimer();
  if (audio === null) return;
  idleTimer = deps.setTimer(() => {
    idleTimer = null;
    suspendCompanionAudio();
  }, COMPANION_AUDIO_IDLE_SUSPEND_MS);
}

/**
 * The context and its master gain, created on first use.
 *
 * Returns `null` where there is no Web Audio at all (jsdom, a stripped
 * embedder) — every caller treats that as "no sound", which is a legitimate
 * outcome for a personality feature and never an error to report.
 *
 * Resumes a suspended context on the way out: browsers also suspend one for
 * their own reasons (an autoplay policy, a backgrounded page), so a caller
 * cannot assume the state it left it in.
 */
export function getCompanionAudio(): CompanionAudio | null {
  if (deps.create === null) return null;
  if (audio === null) {
    const ctx = deps.create();
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    audio = { ctx, master };
    perfLog('context created');
  }
  if (audio.ctx.state === 'suspended') {
    void audio.ctx.resume();
    perfLog('context resumed');
  }
  noteCompanionAudioActivity();
  return audio;
}

/** Park the audio thread now. Idempotent, and a no-op with no context. */
export function suspendCompanionAudio(): void {
  clearIdleTimer();
  if (audio === null || audio.ctx.state === 'suspended') return;
  void audio.ctx.suspend();
  perfLog(`context suspended after ${COMPANION_AUDIO_IDLE_SUSPEND_MS}ms idle`);
}

/**
 * "Companion volume", 0–1, scaling everything at once.
 *
 * Applied to the live master node *and* remembered for a context that does not
 * exist yet, so the slider works before the first sound — which is exactly
 * when a user is most likely to move it.
 */
export function setCompanionVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  if (audio !== null) audio.master.gain.value = volume;
}

export function companionVolume(): number {
  return volume;
}

/**
 * Stop every sound immediately, keeping the context.
 *
 * Implemented as a master **disconnect and rebuild** rather than by tracking
 * live nodes: an oscillator with a scheduled envelope cannot be un-scheduled,
 * and the phase requires "stops instantly" on six different triggers. Cutting
 * the one node they all route through is instant by construction and cannot
 * miss a source — including one a bug forgot to register.
 */
export function stopCompanionAudio(): void {
  if (audio === null) return;
  const { ctx } = audio;
  try {
    audio.master.disconnect();
  } catch {
    // Already disconnected. Nothing to do.
  }
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  audio = { ctx, master };
}

/** Reset module state. Tests only — and the one place `create` is swapped. */
export function __resetCompanionAudioForTest(overrides: Partial<AudioContextDeps> = {}): void {
  clearIdleTimer();
  audio = null;
  volume = 1;
  deps = { ...defaultAudioDeps(), ...overrides };
}

/** The live context, without creating one. For assertions and for `elevator.ts`'s "is it running". */
export function peekCompanionAudio(): CompanionAudio | null {
  return audio;
}
