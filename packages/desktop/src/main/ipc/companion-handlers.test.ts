import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports — the same
// `ipcMain.handle` capture `mcp-handlers.test.ts` makes.
const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));

import { registerCompanionHandlers } from './companion-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw?: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

afterEach(() => {
  handle.mockClear();
});

describe('registerCompanionHandlers', () => {
  it("registers exactly the companion channels — Theme B's two, Theme E's one, Theme F's four and Phase 80 Theme C's two", () => {
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
    })) as { ok: boolean; message?: string };

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Settings, Companion, Microphone');
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
    await expect(invoke(CHANNELS.companionSttStatus)).resolves.toEqual({
      configured: [],
      encryptionAvailable: false,
      // openai-whisper is the only provider with a real factory behind it —
      // deepgram stays in `SttProviderId` (Decision 8) without one.
      implemented: ['openai-whisper'],
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
});
