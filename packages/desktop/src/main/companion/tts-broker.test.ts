import { afterEach, describe, expect, it } from 'vitest';

import {
  cancelQueuedSynthesis,
  configureCompanionTtsBroker,
  disposeCompanionTtsBroker,
  getCompanionTtsStatusAsync,
  reloadCompanionTtsBroker,
  resetCompanionTtsBrokerForTest,
  synthesizeSpeechAsync,
  workerScriptPath,
  type TtsWorkerHandle,
} from './tts-broker';

/**
 * `tts-broker.ts`'s own request/queue/cancel plumbing — Ad Hoc "TTS
 * synthesis blocks the UI". The real engine (`kokoro-js`, `.generate()`, the
 * three failure modes) is `tts.test.ts`'s job, exercised in the
 * `utilityProcess` this broker forks; nothing here runs a real
 * `utilityProcess` at all, matching `tts.test.ts`'s own posture toward
 * `kokoro-js` (a fake for the shape, not the engine underneath it).
 *
 * `FakeWorker` stands in for `TtsWorkerHandle`: a hand-rolled event target
 * (Node's own `EventEmitter` would work too, but this keeps the fake's
 * surface pinned to exactly the three methods the broker calls) whose
 * `postMessage` records what it was asked to do, so a test can synthesize a
 * `'synthesize-reply'`/`'status-reply'` by calling the captured listener
 * directly — no timers, no `await new Promise(setTimeout)` polling.
 */
class FakeWorker implements TtsWorkerHandle {
  static instances: FakeWorker[] = [];

  sent: unknown[] = [];
  killed = false;
  private messageListener: ((message: unknown) => void) | null = null;
  // An array, not a single slot: production `TtsWorkerHandle`s are real
  // `EventEmitter`-style objects (Electron's `UtilityProcess`), and
  // `reloadCompanionTtsBroker` registers a SECOND `'exit'` listener
  // alongside `ensureChild()`'s own `handleExit` — both must fire.
  private exitListeners: ((code: number) => void)[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  on(
    event: 'message' | 'exit',
    listener: ((message: unknown) => void) | ((code: number) => void),
  ): void {
    if (event === 'message') this.messageListener = listener as (message: unknown) => void;
    else this.exitListeners.push(listener as (code: number) => void);
  }

  /** Real `kill()` only sends a signal — it does not itself fire `'exit'`; call `exit()` to simulate that separately. */
  kill(): void {
    this.killed = true;
  }

  /** Simulate the worker replying — the counterpart to whatever `sent` captured. */
  reply(message: unknown): void {
    this.messageListener?.(message);
  }

  /** Simulate a crash, or the worker actually dying after `kill()` — every registered listener fires, matching a real `EventEmitter`. */
  exit(code = 1): void {
    for (const listener of this.exitListeners) listener(code);
  }
}

function fakeSpawn(): TtsWorkerHandle {
  return new FakeWorker();
}

/** `council-runner.test.ts`'s own convention: let a pending microtask/`setImmediate` chain settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The most recently spawned fake worker, or throws — every test spawns exactly one unless it says otherwise. */
function currentWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error('no fake worker spawned');
  return worker;
}

afterEach(() => {
  resetCompanionTtsBrokerForTest();
  FakeWorker.instances = [];
});

/**
 * Ad Hoc "the local voice engine crashed" — the actual regression this PR
 * fixes, and the test that would have caught it. `workerScriptPath` used to
 * rewrite its result's `app.asar` segment to `app.asar.unpacked`
 * unconditionally (mirroring `script-runner-broker.ts`'s own identical
 * rewrite); confirmed against a real `moon run desktop:dist` build, that
 * rewrite is not just unnecessary for a `utilityProcess.fork` target, it
 * actively breaks `require('kokoro-js')` once the file is genuinely
 * unpacked (see `workerScriptPath`'s own doc for the full mechanism and the
 * PR body for the packaged-build transcript proving it both ways). `dirname`
 * is a parameter specifically so this is testable without a real `app.asar`
 * path ever existing on this machine — dev mode's own `__dirname` never has
 * one either, which is exactly why the original bug passed every dev-mode
 * check.
 */
describe('workerScriptPath', () => {
  it('does not rewrite an app.asar segment — utilityProcess.fork reads scripts from inside the asar', () => {
    expect(
      workerScriptPath('/Applications/Midnite Studio.app/Contents/Resources/app.asar/dist/bundle'),
    ).toBe('/Applications/Midnite Studio.app/Contents/Resources/app.asar/dist/bundle/companion-tts-worker.js');
  });

  it('resolves relative to whatever dirname it is given, dev or packaged alike', () => {
    expect(workerScriptPath('/Users/dev/midnite-studio/packages/desktop/dist/bundle')).toBe(
      '/Users/dev/midnite-studio/packages/desktop/dist/bundle/companion-tts-worker.js',
    );
  });
});

describe('synthesizeSpeechAsync', () => {
  it('configures the worker before any synthesize message, in that order', () => {
    configureCompanionTtsBroker('/tmp/user-data', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('hello');

    const worker = currentWorker();
    expect(worker.sent[0]).toEqual({ type: 'configure', directory: '/tmp/user-data' });
    expect(worker.sent[1]).toMatchObject({ type: 'synthesize', text: 'hello' });
  });

  it('resolves with the worker reply, matched by request id', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const pending = synthesizeSpeechAsync('hello', 'af_heart');

    const worker = currentWorker();
    const sent = worker.sent[1] as { type: 'synthesize'; id: string; text: string; voice?: string };
    expect(sent.text).toBe('hello');
    expect(sent.voice).toBe('af_heart');

    worker.reply({
      type: 'synthesize-reply',
      id: sent.id,
      result: { ok: true, value: { audio: new Uint8Array([1, 2, 3]), mime: 'audio/wav' } },
    });

    await expect(pending).resolves.toEqual({
      ok: true,
      value: { audio: new Uint8Array([1, 2, 3]), mime: 'audio/wav' },
    });
  });

  it('dispatches one synthesize message at a time — a second request queues rather than reaching the worker', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const first = synthesizeSpeechAsync('one');
    const second = synthesizeSpeechAsync('two');

    const worker = currentWorker();
    // Only `configure` + one `synthesize` — "two" has not been posted yet.
    expect(worker.sent).toHaveLength(2);
    const firstSent = worker.sent[1] as { id: string };

    worker.reply({
      type: 'synthesize-reply',
      id: firstSent.id,
      result: { ok: true, value: { audio: new Uint8Array(), mime: 'audio/wav' } },
    });
    await first;

    // Now the queued job has been dispatched.
    expect(worker.sent).toHaveLength(3);
    const secondSent = worker.sent[2] as { id: string; text: string };
    expect(secondSent.text).toBe('two');

    worker.reply({
      type: 'synthesize-reply',
      id: secondSent.id,
      result: { ok: true, value: { audio: new Uint8Array(), mime: 'audio/wav' } },
    });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  it('ignores a reply whose id does not match the in-flight job', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const pending = synthesizeSpeechAsync('hello');
    const worker = currentWorker();

    // A stale/duplicate reply for some other id — dropped, not misapplied.
    worker.reply({
      type: 'synthesize-reply',
      id: 'not-the-real-id',
      result: { ok: false, kind: 'error', message: 'wrong job' },
    });

    const sent = worker.sent[1] as { id: string };
    worker.reply({
      type: 'synthesize-reply',
      id: sent.id,
      result: { ok: true, value: { audio: new Uint8Array(), mime: 'audio/wav' } },
    });

    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('spawns only one worker across many requests, reusing it', () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('a');
    void synthesizeSpeechAsync('b');
    void getCompanionTtsStatusAsync(false);

    expect(FakeWorker.instances).toHaveLength(1);
  });
});

describe('cancelQueuedSynthesis', () => {
  it('drops a job still queued (never posted to the worker) without touching the one in flight', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const first = synthesizeSpeechAsync('in flight');
    const second = synthesizeSpeechAsync('queued, unstarted');

    const worker = currentWorker();
    // Still only `configure` + the one in-flight `synthesize` — "queued,
    // unstarted" never reached the worker, which is the whole point.
    expect(worker.sent).toHaveLength(2);

    cancelQueuedSynthesis();
    await expect(second).resolves.toEqual({ ok: false, kind: 'error', message: 'cancelled' });
    // Cancelling never posts anything for the dropped job — no wasted cycle.
    expect(worker.sent).toHaveLength(2);

    // The in-flight job is untouched by the cancel and still resolves normally.
    const inFlightSent = worker.sent[1] as { id: string };
    worker.reply({
      type: 'synthesize-reply',
      id: inFlightSent.id,
      result: { ok: true, value: { audio: new Uint8Array(), mime: 'audio/wav' } },
    });
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it('is a no-op with nothing queued', () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    expect(() => cancelQueuedSynthesis()).not.toThrow();
  });
});

describe('getCompanionTtsStatusAsync', () => {
  it('dispatches immediately even with a synth job in flight — status is not queued behind it', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('busy');
    const status = getCompanionTtsStatusAsync(false);

    const worker = currentWorker();
    // configure, synthesize, AND status — all three already sent.
    expect(worker.sent).toHaveLength(3);
    const statusSent = worker.sent[2] as { type: 'status'; id: string; retry: boolean };
    expect(statusSent.type).toBe('status');
    expect(statusSent.retry).toBe(false);

    worker.reply({
      type: 'status-reply',
      id: statusSent.id,
      value: { engine: 'local', voice: 'ready', reason: null, message: null },
    });
    await expect(status).resolves.toEqual({ engine: 'local', voice: 'ready', reason: null, message: null });
  });
});

describe('a worker exit', () => {
  it('resolves the in-flight job, every queued job, and every pending status as a normal failure', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const inFlight = synthesizeSpeechAsync('in flight');
    const queued = synthesizeSpeechAsync('queued');
    const status = getCompanionTtsStatusAsync(false);

    currentWorker().exit(1);

    await expect(inFlight).resolves.toMatchObject({ ok: false });
    await expect(queued).resolves.toMatchObject({ ok: false });
    await expect(status).resolves.toMatchObject({ voice: 'failed' });
  });

  it('respawns and reconfigures fresh on the next request, rather than reusing the dead worker', () => {
    configureCompanionTtsBroker('/tmp/again', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('one');
    currentWorker().exit(1);

    void synthesizeSpeechAsync('two');
    expect(FakeWorker.instances).toHaveLength(2);
    const second = currentWorker();
    expect(second.sent[0]).toEqual({ type: 'configure', directory: '/tmp/again' });
  });
});

describe('disposeCompanionTtsBroker', () => {
  it('kills the worker and resolves everything outstanding as cancelled', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const inFlight = synthesizeSpeechAsync('one');
    const queued = synthesizeSpeechAsync('two');
    const worker = currentWorker();

    disposeCompanionTtsBroker();

    expect(worker.killed).toBe(true);
    await expect(inFlight).resolves.toEqual({ ok: false, kind: 'error', message: 'cancelled' });
    await expect(queued).resolves.toEqual({ ok: false, kind: 'error', message: 'cancelled' });
  });

  it('is a no-op with no worker ever spawned', () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    expect(() => disposeCompanionTtsBroker()).not.toThrow();
    expect(FakeWorker.instances).toHaveLength(0);
  });
});

/**
 * Ad Hoc "the local voice engine crashed" — Settings' "Reload local engine"
 * control. Unlike `getCompanionTtsStatusAsync`'s own `retry`, which only ever
 * asks the *same* worker again, this kills whatever worker exists and forks
 * a fresh one — the only way to actually clear `tts.ts`'s sticky
 * `loadFailure` (its own module doc: sticky for the process's lifetime), not
 * just retry a transient download.
 *
 * The fresh worker is never forked until the old one's `'exit'` actually
 * fires (confirmed load-bearing against a real packaged build — see
 * `reloadCompanionTtsBroker`'s own doc), so every test here drives that
 * explicitly: call `.kill()`'s effect through the broker, then `.exit()`
 * the killed `FakeWorker` and `flush()` before expecting the replacement.
 */
describe('reloadCompanionTtsBroker', () => {
  it('kills the current worker, waits for it to exit, then reconfigures a fresh one at the same directory', async () => {
    configureCompanionTtsBroker('/tmp/reload', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('warm up');
    const original = currentWorker();
    expect(original.killed).toBe(false);

    const pending = reloadCompanionTtsBroker();
    expect(original.killed).toBe(true);
    // Not yet spawned — the replacement waits on the old worker's own exit.
    expect(FakeWorker.instances).toHaveLength(1);

    original.exit();
    await flush();

    expect(FakeWorker.instances).toHaveLength(2);
    const fresh = currentWorker();
    expect(fresh).not.toBe(original);
    expect(fresh.sent[0]).toEqual({ type: 'configure', directory: '/tmp/reload' });

    const statusSent = fresh.sent[1] as { type: 'status'; id: string };
    fresh.reply({
      type: 'status-reply',
      id: statusSent.id,
      value: { engine: 'local', voice: 'ready', reason: null, message: null },
    });
    await pending;
  });

  it('asks the fresh worker for status with retry: true and resolves with its answer', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('warm up');
    const original = currentWorker(); // the worker being replaced

    const pending = reloadCompanionTtsBroker();
    original.exit();
    await flush();

    const fresh = currentWorker();
    const statusSent = fresh.sent[1] as { type: 'status'; id: string; retry: boolean };
    expect(statusSent.type).toBe('status');
    expect(statusSent.retry).toBe(true);

    fresh.reply({
      type: 'status-reply',
      id: statusSent.id,
      value: { engine: 'local', voice: 'ready', reason: null, message: null },
    });

    await expect(pending).resolves.toEqual({ engine: 'local', voice: 'ready', reason: null, message: null });
  });

  it('resolves whatever was outstanding on the old worker as cancelled, exactly like dispose', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    const inFlight = synthesizeSpeechAsync('one');
    const queued = synthesizeSpeechAsync('two');
    const original = currentWorker();

    const pending = reloadCompanionTtsBroker();
    // The old worker's outstanding jobs resolve immediately, as soon as the
    // teardown runs — well before it has actually exited.
    await expect(inFlight).resolves.toEqual({ ok: false, kind: 'error', message: 'cancelled' });
    await expect(queued).resolves.toEqual({ ok: false, kind: 'error', message: 'cancelled' });

    original.exit();
    await flush();
    const fresh = currentWorker();
    const statusSent = fresh.sent[1] as { type: 'status'; id: string };
    fresh.reply({
      type: 'status-reply',
      id: statusSent.id,
      value: { engine: 'system', voice: 'idle', reason: null, message: null },
    });
    await pending;
  });

  it('spawns and configures a worker immediately when none was running yet — nothing to wait for', async () => {
    configureCompanionTtsBroker('/tmp/fresh', { spawn: fakeSpawn });

    const pending = reloadCompanionTtsBroker();
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = currentWorker();
    expect(worker.sent[0]).toEqual({ type: 'configure', directory: '/tmp/fresh' });

    const statusSent = worker.sent[1] as { type: 'status'; id: string };
    worker.reply({
      type: 'status-reply',
      id: statusSent.id,
      value: { engine: 'system', voice: 'downloading', reason: null, message: null },
    });
    await expect(pending).resolves.toMatchObject({ voice: 'downloading' });
  });

  it('dedupes two overlapping calls into one teardown-and-respawn, not two', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });
    void synthesizeSpeechAsync('warm up');
    const original = currentWorker();

    // Two clicks before the button had a chance to disable itself.
    const first = reloadCompanionTtsBroker();
    const second = reloadCompanionTtsBroker();
    expect(original.killed).toBe(true);

    original.exit();
    await flush();

    // Only the original worker died and only one replacement was spawned —
    // a second overlapping call must not kill the fresh worker the first
    // call just started.
    expect(FakeWorker.instances).toHaveLength(2);

    const fresh = currentWorker();
    const statusSent = fresh.sent[1] as { type: 'status'; id: string };
    fresh.reply({
      type: 'status-reply',
      id: statusSent.id,
      value: { engine: 'local', voice: 'ready', reason: null, message: null },
    });

    const expected = { engine: 'local', voice: 'ready', reason: null, message: null };
    await expect(first).resolves.toEqual(expected);
    await expect(second).resolves.toEqual(expected);
  });

  it('a reload after the previous one finished starts a new one rather than staying deduped forever', async () => {
    configureCompanionTtsBroker('/tmp', { spawn: fakeSpawn });

    const first = reloadCompanionTtsBroker();
    const firstWorker = currentWorker();
    const firstStatus = firstWorker.sent[1] as { type: 'status'; id: string };
    firstWorker.reply({
      type: 'status-reply',
      id: firstStatus.id,
      value: { engine: 'local', voice: 'ready', reason: null, message: null },
    });
    await first;

    const second = reloadCompanionTtsBroker();
    expect(firstWorker.killed).toBe(true);
    firstWorker.exit();
    await flush();

    expect(FakeWorker.instances).toHaveLength(2);
    const secondWorker = currentWorker();
    expect(secondWorker).not.toBe(firstWorker);

    const secondStatus = secondWorker.sent[1] as { type: 'status'; id: string };
    secondWorker.reply({
      type: 'status-reply',
      id: secondStatus.id,
      value: { engine: 'system', voice: 'failed', reason: 'native-module-missing', message: 'still broken' },
    });
    await expect(second).resolves.toMatchObject({ voice: 'failed', reason: 'native-module-missing' });
  });
});
