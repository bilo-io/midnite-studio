import { SFX_LICENCE_SHA256, SFX_NOT_READY_HINT, type SfxProgressEvent, type SfxRequest, type SfxStatus } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createSfxMcpTools } from './sfx-mcp';

/** vitest: `sfx_status` / `sfx_generate` over a fake SFX dispatcher — no model, no worker. */

const consent = { licenceSha256: SFX_LICENCE_SHA256, acceptedAt: '2026-11-01T00:00:00.000Z', revenueAcknowledged: true as const };
const installed: SfxStatus = { state: 'installed', consent, bytesOnDisk: 9, totalBytes: 9 };
const notInstalled: SfxStatus = { state: 'not-installed', consent: null, bytesOnDisk: 0, totalBytes: 9 };
const staleConsent: SfxStatus = { ...installed, consent: { ...consent, licenceSha256: 'old' } };
const unavailable: SfxStatus = { state: 'unavailable', consent: null, bytesOnDisk: 0, totalBytes: 9, reason: 'Stable Audio Open Small runs in Midnite Studio only.' };

function setup(status: SfxStatus) {
  const calls: SfxRequest[] = [];
  const events = new Map<string, Extract<SfxProgressEvent, { kind: 'generate' }>>();
  const tools = createSfxMcpTools({
    handle: vi.fn(async (req: SfxRequest) => {
      calls.push(req);
      if (req.op === 'status') return { ok: true as const, value: status };
      if (req.op === 'generate') events.set(req.generationId, { kind: 'generate', generationId: req.generationId, repoId: req.repoId, project: req.project, status: 'running', stage: 'sampling' });
      return { ok: true as const, value: undefined };
    }),
    resolveRepo: async (repoPath) => (repoPath === '/repo' ? { ok: true, repoId: 'r1' } : { ok: false, kind: 'not-found', message: 'not a registered repository' }),
    generation: (id) => events.get(id),
    newId: () => 'abc',
  });
  return { tools, calls, events };
}

describe('sfx_status', () => {
  it('reports a not-installed model with the licence and tells the agent to ask the user', async () => {
    const { tools } = setup(notInstalled);
    expect(await tools.sfx_status({})).toEqual({
      state: 'not-installed',
      installed: false,
      consentCurrent: false,
      licence: { name: 'Stability AI Community License', url: expect.stringContaining('stability.ai'), revenueLimitUsd: 1_000_000, attribution: 'Powered by Stability AI' },
      downloadBytes: expect.any(Number),
      bytesOnDisk: 0,
      hint: SFX_NOT_READY_HINT,
    });
    expect(SFX_NOT_READY_HINT).toMatch(/Ask the user/);
  });

  it('has no hint once installed with a current consent, and still one when the licence moved on', async () => {
    expect((await setup(installed).tools.sfx_status({})).hint).toBeUndefined();
    expect((await setup(staleConsent).tools.sfx_status({})).hint).toBe(SFX_NOT_READY_HINT);
  });

  it('passes an unavailable host’s own reason through', async () => {
    expect((await setup(unavailable).tools.sfx_status({})).hint).toBe(unavailable.reason);
  });

  it('reports a run by id, with its files as repo-relative paths', async () => {
    const { tools, events } = setup(installed);
    events.set('sfx-1', { kind: 'generate', generationId: 'sfx-1', repoId: 'r1', project: 'blasters', status: 'succeeded', files: ['zap-2s-s1-x.wav'] });
    expect((await tools.sfx_status({ generationId: 'sfx-1' })).generation).toEqual({
      generationId: 'sfx-1',
      project: 'blasters',
      status: 'succeeded',
      files: ['.midnite/media/sfx/blasters/zap-2s-s1-x.wav'],
    });
    await expect(tools.sfx_status({ generationId: 'nope' })).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('sfx_generate', () => {
  const input = { repoPath: '/repo', project: 'blasters', prompt: 'laser zap', options: { seconds: 2, seed: 7 } };

  it('starts a run and returns its id at once, without waiting for the audio', async () => {
    const { tools, calls } = setup(installed);
    expect(await tools.sfx_generate(input)).toEqual({ started: true, generationId: 'sfx-abc' });
    expect(calls.at(-1)).toEqual({ op: 'generate', generationId: 'sfx-abc', repoId: 'r1', project: 'blasters', prompt: 'laser zap', options: { seconds: 2, seed: 7 } });
    expect((await tools.sfx_status({ generationId: 'sfx-abc' })).generation?.status).toBe('running');
  });

  it('refuses while the model is not installed or its licence is not accepted — and never installs or consents', async () => {
    for (const status of [notInstalled, staleConsent]) {
      const { tools, calls } = setup(status);
      await expect(tools.sfx_generate(input)).rejects.toMatchObject({ kind: 'refused', message: expect.stringContaining('Ask the user') });
      expect(calls.map((c) => c.op)).toEqual(['status']);
    }
  });

  it('reports a run that fails before the service sends any event as failed, never not-found', async () => {
    type Failed = { ok: false; kind: 'error'; message: string };
    let finish: (result: Failed) => void = () => {};
    const tools = createSfxMcpTools({
      handle: vi.fn((req: SfxRequest) =>
        req.op === 'status' ? Promise.resolve({ ok: true as const, value: installed }) : new Promise<Failed>((resolve) => (finish = resolve)),
      ),
      resolveRepo: async () => ({ ok: true, repoId: 'r1' }),
      generation: () => undefined,
      newId: () => 'early',
    });
    const { generationId } = await tools.sfx_generate(input);
    // Polled before the service's first event: still the run it just returned.
    expect((await tools.sfx_status({ generationId })).generation).toMatchObject({ generationId, status: 'running', stage: 'loading' });
    finish({ ok: false, kind: 'error', message: 'Accept the Stability AI Community License (Media ▸ SFX) before generating.' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await tools.sfx_status({ generationId })).generation).toEqual({
      generationId,
      project: 'blasters',
      status: 'failed',
      error: 'Accept the Stability AI Community License (Media ▸ SFX) before generating.',
    });
  });

  it('names a changed licence as such, not as a missing install', async () => {
    await expect(setup(staleConsent).tools.sfx_generate(input)).rejects.toMatchObject({ message: expect.stringMatching(/License has changed/) });
  });

  it('refuses in an app without the engine, with its reason', async () => {
    await expect(setup(unavailable).tools.sfx_generate(input)).rejects.toMatchObject({ kind: 'refused', message: unavailable.reason });
  });

  it('refuses a path that is not a registered repository', async () => {
    await expect(setup(installed).tools.sfx_generate({ ...input, repoPath: '/elsewhere' })).rejects.toMatchObject({ kind: 'not-found' });
  });
});
