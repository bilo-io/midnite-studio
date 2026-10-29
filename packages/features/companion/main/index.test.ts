// @vitest-environment node
import type { RuntimeIpc } from '@midnite/studio-runtime';
import { CHANNELS, ok } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The engine itself — real `tts.ts` internals — is `tts.test.ts`'s job; the broker's own
// request/queue/cancel plumbing is `tts-broker.test.ts`'s. This file's job is wiring: which
// channel calls which function, and with what fallback on a bad payload — so the broker entry
// points are stubbed.
const { synthesizeSpeechAsync, getCompanionTtsStatusAsync, cancelQueuedSynthesis, reloadCompanionTtsBroker, companionTtsModelOnDisk } =
  vi.hoisted(() => ({
    synthesizeSpeechAsync: vi.fn(),
    getCompanionTtsStatusAsync: vi.fn(),
    cancelQueuedSynthesis: vi.fn(),
    reloadCompanionTtsBroker: vi.fn(),
    companionTtsModelOnDisk: vi.fn(),
  }));
vi.mock('./tts-broker', () => ({
  synthesizeSpeechAsync,
  getCompanionTtsStatusAsync,
  cancelQueuedSynthesis,
  reloadCompanionTtsBroker,
  companionTtsModelOnDisk,
  configureCompanionTtsBroker: vi.fn(),
  disposeCompanionTtsBroker: vi.fn(),
}));

import { companionMain, STUB_COMPANION_SERVICES } from './index';

// A capturing stand-in for the runtime's IPC: `handle` for invoke channels, `send` for one-way ones.
const handlers = new Map<string, (raw: unknown) => unknown>();
const sends = new Map<string, (raw: unknown) => void>();
const getMediaAccessStatus = vi.fn((): 'granted' | 'denied' => 'granted');
const ipc: RuntimeIpc = {
  handle: (channel, schema, handler, onInvalid) => {
    handlers.set(channel, async (raw) => {
      const parsed = schema.safeParse(raw);
      return parsed.success ? handler(parsed.data) : onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
    });
  },
  handleBare: (channel, handler) => void handlers.set(channel, () => handler()),
  send: (channel, schema, handler, onInvalid) => {
    sends.set(channel, (raw) => {
      const parsed = schema.safeParse(raw);
      if (parsed.success) handler(parsed.data);
      else onInvalid(`${channel}: invalid`);
    });
  },
};

function registerCompanionHandlers(): void {
  handlers.clear();
  sends.clear();
  companionMain.register(
    { ipc, emit: () => {}, trashItem: async () => {} },
    { ...STUB_COMPANION_SERVICES, microphoneAccess: () => getMediaAccessStatus() },
  );
}

/** The listener registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw?: unknown): unknown {
  const listener = handlers.get(channel);
  if (!listener) throw new Error(`no handler registered for ${channel}`);
  return listener(raw);
}

/** The one-way listener registered for `channel`, invoked the way `ipcRenderer.send` would. */
function send(channel: string, raw?: unknown): void {
  const listener = sends.get(channel);
  if (!listener) throw new Error(`no listener registered for ${channel}`);
  listener(raw);
}

afterEach(() => {
  synthesizeSpeechAsync.mockReset();
  getCompanionTtsStatusAsync.mockReset();
  cancelQueuedSynthesis.mockReset();
  reloadCompanionTtsBroker.mockReset();
  getMediaAccessStatus.mockReset();
  getMediaAccessStatus.mockImplementation(() => 'granted');
});

describe('companionMain.register', () => {
  it("registers exactly the companion channels — Theme B's two, Theme E's one, Theme F's four, Phase 80 Theme C's two, Ad Hoc's reload, and Phase 109 Theme F's model check", () => {
    registerCompanionHandlers();
    expect([...handlers.keys()]).toEqual([
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
      CHANNELS.companionTtsModelOnDisk,
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
      passingChecks: null,
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
      // macOS's own verdict, so a refused press can say which side refused.
      microphoneAccess: 'granted',
    });
    expect(getMediaAccessStatus).toHaveBeenCalled();
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

  it("answers the audition's model check from disk, without asking the worker (Phase 109 Theme F)", async () => {
    companionTtsModelOnDisk.mockReturnValue(true);
    registerCompanionHandlers();

    await expect(invoke(CHANNELS.companionTtsModelOnDisk, {})).resolves.toEqual(ok({ onDisk: true }));
    expect(getCompanionTtsStatusAsync).not.toHaveBeenCalled();

    companionTtsModelOnDisk.mockReturnValue(false);
    await expect(invoke(CHANNELS.companionTtsModelOnDisk, {})).resolves.toEqual(ok({ onDisk: false }));
  });

  it('registers the cancel channel as a one-way send, and calls the broker when sent', () => {
    registerCompanionHandlers();
    // Two one-way channels now, in registration order: Phase 81 Theme F's
    // `companionUiReply` (the renderer's half of the first main->renderer
    // request/reply) registers before `companionTtsCancel`. Asserted as the
    // exact list on purpose — a third `handleSend` landing here unnoticed is
    // what this is meant to catch.
    expect([...sends.keys()]).toEqual([
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
