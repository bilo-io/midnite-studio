import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { failure, type GitOpResult } from '@midnite/studio-shared';
import { utilityProcess } from 'electron';

import type { CompanionTtsStatusValue } from './tts';

/**
 * Ad Hoc "TTS synthesis blocks the UI" — the main-process broker for the
 * `companion-tts-worker` `utilityProcess`, mirroring
 * `script-runner-broker.ts`'s own shape closely (spawn lazily, keep one
 * child alive, correlate replies by a request id, treat an exit as "resolve
 * everything outstanding"). What differs, and why, is documented at each
 * function below; the summary is that this broker owns strictly more state
 * than that one does, because `companion-tts-worker/index.ts` is `tts.ts`'s
 * *sole* owner (see that file's own doc) and every one of its three call
 * shapes — configure, synthesize, status — has to reach it.
 *
 * **Why a queue lives here and not in the worker.** `KokoroTtsInstance` is
 * one ONNX session; nothing in `tts.ts` serializes concurrent `.generate()`
 * calls against it, and two overlapping ones is untested territory this
 * broker has no reason to risk. Rather than teach the worker its own queue,
 * this broker dispatches at most one `'synthesize'` message at a time and
 * holds the rest here, undispatched — which is also exactly what makes an
 * interrupt's "a queued-but-unstarted synth job must be droppable"
 * (`cancelQueuedSynthesis` below) a same-process array splice rather than a
 * round trip that could race the very job it is trying to cancel. `'status'`
 * requests are NOT part of this lane: `getCompanionTtsStatus` never touches
 * `.generate()`, so a Settings-page poll would otherwise queue for however
 * long an utterance is mid-flight for no reason.
 */

export type TtsWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => void;
};

export type TtsBrokerDeps = {
  /** `() => utilityProcess.fork(workerScriptPath(), …)` in production — a fake in tests, the same shape `CompanionTtsDeps.loadModule` injects `kokoro-js` with in `tts.test.ts`. */
  spawn: () => TtsWorkerHandle;
};

function workerScriptPath(): string {
  // `script-runner-broker.ts`'s own defensive rewrite: `utilityProcess.fork`
  // can read a script from inside the asar, unlike `child_process` — but
  // this mirrors that file exactly rather than assume it never needs to.
  return join(__dirname, 'companion-tts-worker.js').replace('app.asar', 'app.asar.unpacked');
}

function defaultSpawn(): TtsWorkerHandle {
  return utilityProcess.fork(workerScriptPath(), [], {
    serviceName: 'mstudio-companion-tts',
    stdio: 'ignore',
  });
}

let deps: TtsBrokerDeps = { spawn: defaultSpawn };
let configuredDirectory: string | null = null;
let child: TtsWorkerHandle | null = null;

type SynthesizeResult = GitOpResult<{ audio: Uint8Array; mime: string }>;

type SynthesizeJob = {
  id: string;
  text: string;
  voice: string | undefined;
  resolve: (result: SynthesizeResult) => void;
};

/** Not yet posted to the worker — see the module doc for why this lane exists at all. */
const synthQueue: SynthesizeJob[] = [];
/** Posted, awaiting `'synthesize-reply'`. At most one, by construction of `pumpSynthQueue`. */
let synthInFlight: SynthesizeJob | null = null;

type StatusJob = { resolve: (value: CompanionTtsStatusValue) => void };
/** Every `'status'` request dispatched immediately, so this is purely a reply-correlation map, never a queue. */
const statusPending = new Map<string, StatusJob>();

const CRASH_MESSAGE = 'The local voice engine crashed. The companion will keep using the system voice.';

function crashedStatus(): CompanionTtsStatusValue {
  return { engine: 'system', voice: 'failed', reason: 'native-module-missing', message: CRASH_MESSAGE };
}

function handleMessage(message: unknown): void {
  const data = message as
    | { type: 'synthesize-reply'; id: string; result: SynthesizeResult }
    | { type: 'status-reply'; id: string; value: CompanionTtsStatusValue };

  if (data.type === 'synthesize-reply') {
    // A reply for an id that is not the current in-flight job is stale —
    // the job it belonged to was already resolved some other way (a crash,
    // a dispose) — and is dropped rather than misapplied to whatever is
    // in flight now.
    if (synthInFlight?.id !== data.id) return;
    const job = synthInFlight;
    synthInFlight = null;
    job.resolve(data.result);
    pumpSynthQueue();
    return;
  }

  const job = statusPending.get(data.id);
  if (!job) return;
  statusPending.delete(data.id);
  job.resolve(data.value);
}

/** An exit — a crash, a kill — resolves everything outstanding rather than leaving a caller hanging forever; `script-runner-broker.ts`'s `rejectAllPending` is the identical posture for the identical reason. */
function handleExit(): void {
  child = null;
  if (synthInFlight) {
    synthInFlight.resolve(failure(CRASH_MESSAGE));
    synthInFlight = null;
  }
  for (const job of synthQueue.splice(0)) job.resolve(failure(CRASH_MESSAGE));
  for (const job of statusPending.values()) job.resolve(crashedStatus());
  statusPending.clear();
}

function ensureChild(): TtsWorkerHandle {
  if (child) return child;
  const next = deps.spawn();
  next.on('message', handleMessage);
  next.on('exit', handleExit);
  // Sent before this function returns the child to any caller, so it is
  // always the first message the worker's `process.parentPort` sees — Node
  // preserves message order on one port, and every other message this
  // broker ever posts goes through a call to `ensureChild()` first.
  if (configuredDirectory !== null) {
    next.postMessage({ type: 'configure', directory: configuredDirectory });
  }
  child = next;
  return next;
}

function pumpSynthQueue(): void {
  if (synthInFlight !== null) return;
  const job = synthQueue.shift();
  if (job === undefined) return;
  synthInFlight = job;
  ensureChild().postMessage({ type: 'synthesize', id: job.id, text: job.text, voice: job.voice });
}

/**
 * Point every future worker (this one, and any respawned after a crash) at
 * `userData` — `main/index.ts`'s boot sequence, in place of the direct
 * `configureCompanionTts(userData)` call this replaces. `overrides` is
 * test-only, mirroring `resetCompanionTtsForTest`'s own `loadModule`
 * injection point.
 */
export function configureCompanionTtsBroker(directory: string, overrides: Partial<TtsBrokerDeps> = {}): void {
  configuredDirectory = directory;
  if (overrides.spawn) deps = { ...deps, ...overrides };
}

/**
 * Text in, one WAV clip out — same contract `tts.ts`'s own `synthesizeSpeech`
 * promises (never throws, always `GitOpResult`), now proxied through the
 * worker instead of run inline. Enqueues rather than dispatching directly:
 * see the module doc for why at most one `'synthesize'` message is ever
 * in flight to the worker.
 */
export function synthesizeSpeechAsync(text: string, voice?: string): Promise<SynthesizeResult> {
  return new Promise((resolve) => {
    synthQueue.push({ id: randomUUID(), text, voice, resolve });
    ensureChild();
    pumpSynthQueue();
  });
}

/** `tts.ts`'s own `getCompanionTtsStatus`, proxied — dispatched immediately, never queued behind a synth job (see the module doc). */
export function getCompanionTtsStatusAsync(retry: boolean): Promise<CompanionTtsStatusValue> {
  const id = randomUUID();
  return new Promise((resolve) => {
    statusPending.set(id, { resolve });
    ensureChild().postMessage({ type: 'status', id, retry });
  });
}

/**
 * Drop every synth job still queued in THIS process — not yet posted to the
 * worker, so nothing here costs the worker a single cycle of wasted
 * inference. `speaker.ts`'s `createLocalSpeaker.cancel()` fires this over
 * `companionTtsCancel` alongside its own audio-node stop and local-queue
 * clear (Escape, a click, a new utterance — `shared/companion.ts`'s
 * `interrupt`, never `settle`).
 *
 * The job actually in flight (if any) is deliberately left alone: it has
 * already started `.generate()`, which exposes no cooperative cancellation,
 * so "stop dead" for it means only that its eventual reply is ignored —
 * which the renderer's own `active !== item` guard in `speaker.ts` already
 * does for a superseded item, the identical shape `createSpeaker`'s system
 * engine has always used for `speechSynthesis`'s `onerror`/`interrupted`.
 */
export function cancelQueuedSynthesis(): void {
  for (const job of synthQueue.splice(0)) job.resolve(failure('cancelled'));
}

/** Kills the worker, if one is running — `main/index.ts`'s `before-quit`, beside `disposeScriptRunner`. Nothing here is worth flushing, only worth not leaving behind. */
export function disposeCompanionTtsBroker(): void {
  cancelQueuedSynthesis();
  if (synthInFlight) {
    synthInFlight.resolve(failure('cancelled'));
    synthInFlight = null;
  }
  for (const job of statusPending.values()) job.resolve(crashedStatus());
  statusPending.clear();
  const current = child;
  child = null;
  current?.kill();
}

/** Deduped the same way `ensureModel` dedupes concurrent provisioning attempts — see `reloadCompanionTtsBroker`'s own doc. */
let reloadInFlight: Promise<CompanionTtsStatusValue> | null = null;

/**
 * Settings' "Reload local engine" control (Ad Hoc: recover from a crashed
 * worker without restarting the app) — tears down whatever worker is
 * currently running (a crashed one, a wedged one, or a healthy one the user
 * just wants a fresh process for after changing the voice) and forks a new
 * one, then answers with that fresh worker's own `companionTtsStatus`
 * value.
 *
 * **Why this recovers from `native-module-missing` when a plain status
 * retry cannot.** `tts.ts`'s `loadFailure` is sticky *for the lifetime of
 * the process that set it* (its own module doc) — the worker process, since
 * this engine swap moved to a `utilityProcess`. `getCompanionTtsStatusAsync`
 * alone can only ask the *same* worker again, which short-circuits on that
 * sticky flag regardless of `retry`. Killing the worker and forking a new
 * one gets a fresh process with fresh module state, which is the only way a
 * crashed-worker or a since-fixed-native-module failure actually clears —
 * exactly the packaging bug this ad hoc task's other half fixed
 * (`electron-builder.yml`'s `asarUnpack`).
 *
 * **Deduped**, the same shape `ensureModel` uses for a provisioning
 * download: two callers racing (a double-click before the button disables,
 * a second window) share one teardown-and-respawn rather than each killing
 * a worker the other just started. `disposeCompanionTtsBroker`'s own
 * teardown is inlined here rather than reused — that function also clears
 * `configuredDirectory`, which a reload must NOT do: the fresh worker still
 * needs `ensureChild()`'s "configure on first message" behaviour to point
 * it at the same `userData` directory.
 */
export function reloadCompanionTtsBroker(): Promise<CompanionTtsStatusValue> {
  if (reloadInFlight) return reloadInFlight;

  const run = (async (): Promise<CompanionTtsStatusValue> => {
    cancelQueuedSynthesis();
    if (synthInFlight) {
      synthInFlight.resolve(failure('cancelled'));
      synthInFlight = null;
    }
    for (const job of statusPending.values()) job.resolve(crashedStatus());
    statusPending.clear();
    const current = child;
    child = null;
    current?.kill();

    // `ensureChild()` (inside `getCompanionTtsStatusAsync`) forks the fresh
    // worker and posts `'configure'` before anything else can reach it;
    // `retry: true` gives a since-fixed download a fresh attempt too, not
    // just a crashed native module.
    return getCompanionTtsStatusAsync(true);
  })();

  reloadInFlight = run;
  return run.finally(() => {
    reloadInFlight = null;
  });
}

/** Reset module state. Tests only — mirrors `resetCompanionTtsForTest`. */
export function resetCompanionTtsBrokerForTest(overrides: Partial<TtsBrokerDeps> = {}): void {
  disposeCompanionTtsBroker();
  configuredDirectory = null;
  deps = { spawn: overrides.spawn ?? defaultSpawn };
  reloadInFlight = null;
}
