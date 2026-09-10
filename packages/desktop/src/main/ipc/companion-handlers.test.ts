import { CHANNELS, ok } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports — the same
// `ipcMain.handle` capture `mcp-handlers.test.ts` makes. `on` joins it here
// (Ad Hoc "TTS synthesis blocks the UI"): `companionTtsCancel` registers
// through `handleSend`/`ipcMain.on`, the first one-way channel this file
// had to capture; Theme F's `companionUiReply` is the second.
const { handle, on } = vi.hoisted(() => ({ handle: vi.fn(), on: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle, on } }));

// The engine itself — real `tts.ts` internals, `.generate()` and all — is
// `tts.test.ts`'s job; the broker's own request/queue/cancel plumbing is
// `tts-broker.test.ts`'s. This file's job is wiring: which channel calls
// which function, and with what fallback on a bad payload — so the three
// broker entry points are stubbed rather than exercising a real
// `utilityProcess.fork` (which this test's `electron` mock does not provide
// at all).
const { synthesizeSpeechAsync, getCompanionTtsStatusAsync, cancelQueuedSynthesis, reloadCompanionTtsBroker } =
  vi.hoisted(() => ({
    synthesizeSpeechAsync: vi.fn(),
    getCompanionTtsStatusAsync: vi.fn(),
    cancelQueuedSynthesis: vi.fn(),
    reloadCompanionTtsBroker: vi.fn(),
  }));
vi.mock('../companion/tts-broker', () => ({
  synthesizeSpeechAsync,
  getCompanionTtsStatusAsync,
  cancelQueuedSynthesis,
  reloadCompanionTtsBroker,
}));

import { registerCompanionHandlers } from './companion-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw?: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

/** The `ipcMain.on` listener main registered for `channel`, invoked the way `ipcRenderer.send` would. */
function send(channel: string, raw?: unknown): void {
  const [, listener] = on.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no listener registered for ${channel}`);
  listener({}, raw);
}

afterEach(() => {
  handle.mockClear();
  on.mockClear();
  synthesizeSpeechAsync.mockReset();
  getCompanionTtsStatusAsync.mockReset();
  cancelQueuedSynthesis.mockReset();
  reloadCompanionTtsBroker.mockReset();
});

describe('registerCompanionHandlers', () => {
  it("registers exactly the companion channels — Theme B's two, Theme E's one, Theme F's four, Phase 80 Theme C's two, and Ad Hoc's reload", () => {
    registerCompanionHandlers();
    expect(handle.mock.calls.map(([channel]) => channel)).toEqual([
      CHANNELS.companionSnapshot,
      CHANNELS.companionDigest,
      CHANNELS.companionAsk,
      CHANNELS.companionTranscribe,
      CHANNELS.companionSttTest,
      CHANNELS.companionSttSet,
      CHANNELS.companionSttStatus,
      CHANNELS.companionTtsSynthesize,
      CHANNELS.companionTtsStatus,
      CHANNELS.companionTtsReload,
    ]);
  });

  it('answers an unreadable ask payload with the error envelope, not a rejection', async () => {
    registerCompanionHandlers();
    // `companionAsk` is the one companion channel whose fallback is an
    // envelope rather than an empty value — see the module's own doc for why
    // its failures are things the companion *says*.
    await expect(invoke(CHANNELS.companionAsk, { kind: 'route' })).resolves.toMatchObject({
      ok: false,
      kind: 'error',
    });
  });

  it('answers an unreadable snapshot payload with the empty snapshot, not a rejection', async () => {
    registerCompanionHandlers();
    // `repoPath` is required (nullable, not optional) — a bare `{}` fails the
    // schema, and `handle` resolves with the fallback rather than rejecting.
    await expect(invoke(CHANNELS.companionSnapshot, {})).resolves.toMatchObject({
      repo: null,
      repos: 0,
      openPulls: null,
      failingChecks: null,
    });
  });

  it('answers an unreadable digest payload with an empty window', async () => {
    registerCompanionHandlers();
    const digest = (await invoke(CHANNELS.companionDigest, { repoPath: '' })) as {
      landed: unknown[];
      inProgress: unknown[];
      since: number;
    };
    expect(digest.landed).toEqual([]);
    expect(digest.inProgress).toEqual([]);
    expect(digest.since).toBeGreaterThan(0);
  });

  it('answers a snapshot with no repo named without touching a repo-scoped tool', async () => {
    registerCompanionHandlers();
    // No repo registry is configured in this test process, so `repo.list`
    // answers empty and the handler still resolves a valid snapshot.
    await expect(invoke(CHANNELS.companionSnapshot, { repoPath: null })).resolves.toMatchObject({
      repo: null,
      branch: null,
    });
  });

  /*
    Theme F's four. No STT vault is configured in this test process, so
    `sttDeps()` is the `nullSttCredentials` fallback — which is exactly the
    state worth asserting: every voice channel has to answer a value, and the
    value has to name the fix. A channel that rejected here would reach the
    renderer as an opaque "Error invoking remote method" with the real cause
    gone, and this one's cause is a sentence the companion speaks aloud.
  */
  it('answers a transcribe with no key configured through the error arm', async () => {
    registerCompanionHandlers();
    const result = (await invoke(CHANNELS.companionTranscribe, {
      audio: new Uint8Array([1, 2, 3]),
      mime: 'audio/webm;codecs=opus',
      // Explicit: an unrequested transcribe now resolves to the key-free
      // default (`whisper-local`), which is its own test below — this one is
      // specifically the cloud provider's missing-key path.
      providerId: 'openai-whisper',
    })) as { ok: boolean; message?: string };

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Settings, Companion, Microphone');
  });

  it('answers an unrequested transcribe with the key-free default, honestly reporting it unset here', async () => {
    // `configureLocalStt` is never called in this test process (unlike
    // `main/index.ts`'s real boot, which wires it beside `configureStt`), so
    // this asserts the channel still answers a value rather than throwing —
    // the same contract `sttDeps()`'s null-credentials fallback proves above.
    registerCompanionHandlers();
    const result = (await invoke(CHANNELS.companionTranscribe, {
      audio: new Uint8Array([1, 2, 3]),
      mime: 'audio/wav',
    })) as { ok: boolean; message?: string };

    expect(result.ok).toBe(false);
    expect(result.message).toContain('not set up yet');
  });

  it('answers an unreadable transcribe payload through the same arm', async () => {
    registerCompanionHandlers();
    // `audio` must be a `Uint8Array`; a plain array fails the schema and
    // `handleOp` answers `failure(...)` rather than rejecting.
    await expect(
      invoke(CHANNELS.companionTranscribe, { audio: [1, 2, 3], mime: 'audio/webm' }),
    ).resolves.toMatchObject({ ok: false, kind: 'error' });
  });

  it('answers the status read with nothing configured rather than throwing', async () => {
    registerCompanionHandlers();
    await expect(invoke(CHANNELS.companionSttStatus, {})).resolves.toEqual({
      configured: [],
      encryptionAvailable: false,
      // whisper-local and openai-whisper both have a real factory behind
      // them — deepgram stays in `SttProviderId` (Decision 8) without one.
      implemented: ['whisper-local', 'openai-whisper'],
      // Nothing called `configureLocalStt` in this test, so the local
      // engine's own deps are unset — reported honestly as idle rather than
      // a throw.
      localModel: { state: 'idle', reason: null, message: null },
    });
  });

  it('accepts a key write against the null vault without complaint', async () => {
    registerCompanionHandlers();
    await expect(
      invoke(CHANNELS.companionSttSet, { providerId: 'openai-whisper', key: 'sk-test' }),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects an unknown provider id at the boundary, as a value', async () => {
    registerCompanionHandlers();
    await expect(
      invoke(CHANNELS.companionSttTest, { providerId: 'whisper.cpp' }),
    ).resolves.toMatchObject({ ok: false, kind: 'error' });
  });

  /*
    Ad Hoc "TTS synthesis blocks the UI" — the local voice engine now runs
    off a `utilityProcess`, proxied through `tts-broker.ts`. These three
    assert the swap actually routes through it (not `tts.ts` directly) and
    that the new one-way cancel channel is wired the same way every other
    `handleSend` channel in this app is.
  */
  it('routes a synthesize request through the broker, not the engine module directly', async () => {
    synthesizeSpeechAsync.mockResolvedValue(ok({ audio: new Uint8Array([1]), mime: 'audio/wav' }));
    registerCompanionHandlers();

    await expect(invoke(CHANNELS.companionTtsSynthesize, { text: 'hi' })).resolves.toEqual(
      ok({ audio: new Uint8Array([1]), mime: 'audio/wav' }),
    );
    expect(synthesizeSpeechAsync).toHaveBeenCalledWith('hi', undefined);
  });

  it('answers an unreadable synthesize payload through the error arm without reaching the broker', async () => {
    registerCompanionHandlers();
    // `text` requires at least one character.
    await expect(invoke(CHANNELS.companionTtsSynthesize, { text: '' })).resolves.toMatchObject({
      ok: false,
      kind: 'error',
    });
    expect(synthesizeSpeechAsync).not.toHaveBeenCalled();
  });

  it('routes a status request through the broker and wraps it in ok(...)', async () => {
    getCompanionTtsStatusAsync.mockResolvedValue({
      engine: 'local',
      voice: 'ready',
      reason: null,
      message: null,
    });
    registerCompanionHandlers();

    await expect(invoke(CHANNELS.companionTtsStatus, {})).resolves.toEqual(
      ok({ engine: 'local', voice: 'ready', reason: null, message: null }),
    );
    expect(getCompanionTtsStatusAsync).toHaveBeenCalledWith(false);
  });

  /*
    Settings' "Reload local engine" control (Ad Hoc: recover from a crashed
    worker without restarting the app) — `handleOp` wraps whatever
    `reloadCompanionTtsBroker` resolves with in `ok(...)`, the same posture
    `companionTtsStatus` takes: the reload's own outcome (ready, still
    failed) lives in the value, never in the envelope.
  */
  it('routes a reload request through the broker and wraps it in ok(...), even a failed one', async () => {
    reloadCompanionTtsBroker.mockResolvedValue({
      engine: 'system',
      voice: 'failed',
      reason: 'native-module-missing',
      message: 'still broken after reload',
    });
    registerCompanionHandlers();

    await expect(invoke(CHANNELS.companionTtsReload, {})).resolves.toEqual(
      ok({
        engine: 'system',
        voice: 'failed',
        reason: 'native-module-missing',
        message: 'still broken after reload',
      }),
    );
    expect(reloadCompanionTtsBroker).toHaveBeenCalledTimes(1);
  });

  it('a malformed reload payload still reaches the broker — CompanionTtsReloadRequest is a bare, unvalidated signal', async () => {
    reloadCompanionTtsBroker.mockResolvedValue({
      engine: 'local',
      voice: 'ready',
      reason: null,
      message: null,
    });
    registerCompanionHandlers();

    // `z.object({})` is stripped, not strict — an unexpected extra field
    // still parses, matching `companionTtsCancel`'s own request shape.
    await expect(invoke(CHANNELS.companionTtsReload, { extra: 'field' })).resolves.toMatchObject({
      ok: true,
    });
    expect(reloadCompanionTtsBroker).toHaveBeenCalledTimes(1);
  });

  it('registers the cancel channel through ipcMain.on (handleSend), and calls the broker when sent', () => {
    registerCompanionHandlers();
    // Two one-way channels now, in registration order: Phase 81 Theme F's
    // `companionUiReply` (the renderer's half of the first main->renderer
    // request/reply) registers before `companionTtsCancel`. Asserted as the
    // exact list on purpose — a third `handleSend` landing here unnoticed is
    // what this is meant to catch.
    expect(on.mock.calls.map(([channel]) => channel)).toEqual([
      CHANNELS.companionUiReply,
      CHANNELS.companionTtsCancel,
    ]);

    send(CHANNELS.companionTtsCancel, {});
    expect(cancelQueuedSynthesis).toHaveBeenCalledTimes(1);
  });

  it('a malformed cancel payload is silently ignored rather than thrown', () => {
    registerCompanionHandlers();
    // `CompanionTtsCancelRequest` is `z.object({})` — stripped, not
    // strict, so an unexpected extra field still parses; a non-object does
    // not. `handleSend`'s `onInvalid` here is a no-op (nothing to log for a
    // bare signal) — this only proves it does not throw across the boundary.
    expect(() => send(CHANNELS.companionTtsCancel, 'not an object')).not.toThrow();
    expect(cancelQueuedSynthesis).not.toHaveBeenCalled();
  });
});
