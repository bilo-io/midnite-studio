import { MUSIC_OFF_MESSAGE, SFX_LICENCE_SHA256, SFX_NOT_READY_HINT, type SfxProgressEvent, type SfxRequest, type SfxStatus } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSfxMcpTools } from '@midnite/studio-feature-media-audio/main';

import { dispatchMcpCall } from './dispatch';
import { setSfxTools } from './sfx-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowMusicState } from './ui-gate';

/** vitest: `sfx_status` / `sfx_generate` through the real MCP dispatcher, with a fake SFX service. */

const installed: SfxStatus = {
  state: 'installed',
  consent: { licenceSha256: SFX_LICENCE_SHA256, acceptedAt: '2026-11-01T00:00:00.000Z', revenueAcknowledged: true },
  bytesOnDisk: 9,
  totalBytes: 9,
};
const notInstalled: SfxStatus = { state: 'not-installed', consent: null, bytesOnDisk: 0, totalBytes: 9 };

function setup(status: SfxStatus) {
  const calls: SfxRequest[] = [];
  const events = new Map<string, Extract<SfxProgressEvent, { kind: 'generate' }>>();
  setSfxTools(
    createSfxMcpTools({
      handle: vi.fn(async (req: SfxRequest) => {
        calls.push(req);
        if (req.op === 'status') return { ok: true as const, value: status };
        if (req.op === 'generate') events.set(req.generationId, { kind: 'generate', generationId: req.generationId, repoId: req.repoId, project: req.project, status: 'running', stage: 'sampling', fraction: 0.25 });
        return { ok: true as const, value: undefined };
      }),
      resolveRepo: async (repoPath) => (repoPath === '/repo' ? { ok: true, repoId: 'r1' } : { ok: false, kind: 'not-found', message: 'not a registered repository' }),
      generation: (id) => events.get(id),
      newId: () => 'abc',
    }),
  );
  return { calls, events };
}

describe('SFX over the global MCP dispatcher', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => setSfxTools(null));

  it('reports a not-installed model with the licence and tells the agent to ask the user', async () => {
    setup(notInstalled);
    expect(await dispatchMcpCall('sfx_status', {})).toEqual({
      ok: true,
      value: expect.objectContaining({
        state: 'not-installed',
        installed: false,
        consentCurrent: false,
        licence: expect.objectContaining({ name: 'Stability AI Community License', revenueLimitUsd: 1_000_000 }),
        hint: SFX_NOT_READY_HINT,
      }),
    });
  });

  it('refuses to generate while the music switch is off, and while the model is not installed — and never installs it', async () => {
    const off = setup(installed);
    const input = { repoPath: '/repo', project: 'zaps', prompt: 'laser zap' };
    expect(await dispatchMcpCall('sfx_generate', input)).toEqual({ ok: false, kind: 'refused', message: MUSIC_OFF_MESSAGE });
    expect(off.calls).toEqual([]);

    setMcpAllowMusicState(true);
    const missing = setup(notInstalled);
    expect(await dispatchMcpCall('sfx_generate', input)).toMatchObject({ ok: false, kind: 'refused', message: expect.stringContaining('Ask the user') });
    expect(missing.calls.map((c) => c.op)).toEqual(['status']);
  });

  it('starts a run and reports it by id until it lists its files', async () => {
    setMcpAllowMusicState(true);
    const { calls, events } = setup(installed);
    const started = await dispatchMcpCall('sfx_generate', { repoPath: '/repo', project: 'zaps', prompt: 'laser zap', options: { seconds: 2 } });
    expect(started).toEqual({ ok: true, value: { started: true, generationId: 'sfx-abc' } });
    expect(calls[1]).toMatchObject({ op: 'generate', generationId: 'sfx-abc', repoId: 'r1', project: 'zaps', prompt: 'laser zap', options: { seconds: 2 } });
    expect(await dispatchMcpCall('sfx_status', { generationId: 'sfx-abc' })).toMatchObject({
      ok: true,
      value: { generation: { generationId: 'sfx-abc', status: 'running', stage: 'sampling', fraction: 0.25 } },
    });
    events.set('sfx-abc', { kind: 'generate', generationId: 'sfx-abc', repoId: 'r1', project: 'zaps', status: 'succeeded', files: ['laser-zap.wav'] });
    expect(await dispatchMcpCall('sfx_status', { generationId: 'sfx-abc' })).toMatchObject({
      ok: true,
      value: { generation: { status: 'succeeded', files: ['.midnite/media/sfx/zaps/laser-zap.wav'] } },
    });
    expect(await dispatchMcpCall('sfx_status', { generationId: 'nope' })).toMatchObject({ ok: false, kind: 'not-found' });
    expect(await dispatchMcpCall('sfx_generate', { repoPath: '/elsewhere', project: 'zaps', prompt: 'x' })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('answers, not throws a crash, before the service is bound', async () => {
    setSfxTools(null);
    expect(await dispatchMcpCall('sfx_status', {})).toMatchObject({ ok: false, kind: 'error' });
  });
});
