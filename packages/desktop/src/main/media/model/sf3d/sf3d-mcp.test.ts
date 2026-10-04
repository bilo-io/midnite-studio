import { MODELS_OFF_MESSAGE, SF3D_LICENCE_SHA256, type Sf3dProgressEvent, type Sf3dRequest, type Sf3dStatus } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchMcpCall } from '../../../mcp/dispatch';
import { setSf3dTools } from '../../../mcp/model-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowModelsState } from '../../../mcp/ui-gate';
import { createSf3dMcpTools, SF3D_NOT_READY_HINT } from './sf3d-mcp';

/** vitest: `model_sf3d_status` / `model_generate_sf3d` through the real MCP dispatcher, with a fake SF3D service. */

const installed: Sf3dStatus = {
  state: 'installed',
  consent: { licenceSha256: SF3D_LICENCE_SHA256, acceptedAt: '2026-10-04T00:00:00.000Z', revenueAcknowledged: true },
  bytesOnDisk: 9,
  totalBytes: 9,
};
const notInstalled: Sf3dStatus = { state: 'not-installed', consent: null, bytesOnDisk: 0, totalBytes: 9 };

function setup(status: Sf3dStatus) {
  const calls: Sf3dRequest[] = [];
  const events = new Map<string, Extract<Sf3dProgressEvent, { kind: 'generate' }>>();
  const tools = createSf3dMcpTools({
    handle: vi.fn(async (req: Sf3dRequest) => {
      calls.push(req);
      if (req.op === 'status') return { ok: true as const, value: status };
      if (req.op === 'generate') events.set(req.generationId, { kind: 'generate', generationId: req.generationId, repoId: req.repoId, project: req.project, status: 'running', stage: 'backbone' });
      return { ok: true as const, value: undefined };
    }),
    resolveRepo: async (repoPath) => (repoPath === '/repo' ? { ok: true, repoId: 'r1' } : { ok: false, kind: 'not-found', message: 'not a registered repository' }),
    readFile: async (path) => {
      if (path === '/repo/art/mug.png') return Buffer.from('png-bytes');
      throw new Error('ENOENT');
    },
    generation: (id) => events.get(id),
    newId: () => 'abc',
  });
  setSf3dTools(tools);
  return { calls, events };
}

describe('SF3D over the global MCP dispatcher', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => setSf3dTools(null));

  it('reports a not-installed SF3D with the licence and what the user must do', async () => {
    setup(notInstalled);
    expect(await dispatchMcpCall('model_sf3d_status', {})).toEqual({
      ok: true,
      value: expect.objectContaining({
        state: 'not-installed',
        installed: false,
        consentCurrent: false,
        licence: { name: 'Stability AI Community License', url: expect.stringContaining('stability.ai'), revenueLimitUsd: 1_000_000 },
        hint: SF3D_NOT_READY_HINT,
      }),
    });
  });

  it('refuses to generate while the Settings switch is off, and while SF3D is not installed', async () => {
    const off = setup(installed);
    const input = { repoPath: '/repo', project: 'props', imagePath: 'art/mug.png' };
    expect(await dispatchMcpCall('model_generate_sf3d', input)).toEqual({ ok: false, kind: 'refused', message: MODELS_OFF_MESSAGE });
    expect(off.calls).toEqual([]);

    setMcpAllowModelsState(true);
    const missing = setup(notInstalled);
    expect(await dispatchMcpCall('model_generate_sf3d', input)).toMatchObject({ ok: false, kind: 'refused', message: expect.stringMatching(/not installed/) });
    expect(missing.calls.map((c) => c.op)).toEqual(['status']);
  });

  it('starts a run from a picture inside the repo and reports it by id', async () => {
    setMcpAllowModelsState(true);
    const { calls } = setup(installed);
    const started = await dispatchMcpCall('model_generate_sf3d', { repoPath: '/repo', project: 'props', imagePath: 'art/mug.png', textureSize: 512 });
    expect(started).toEqual({ ok: true, value: { started: true, generationId: 'sf3d-abc' } });
    expect(calls[1]).toEqual({
      op: 'generate',
      generationId: 'sf3d-abc',
      repoId: 'r1',
      project: 'props',
      image: { name: 'mug.png', mime: 'image/png', data: Buffer.from('png-bytes').toString('base64') },
      textureSize: 512,
    });
    expect(await dispatchMcpCall('model_sf3d_status', { generationId: 'sf3d-abc' })).toMatchObject({
      ok: true,
      value: { installed: true, generation: { generationId: 'sf3d-abc', project: 'props', status: 'running', stage: 'backbone' } },
    });
    expect(await dispatchMcpCall('model_sf3d_status', { generationId: 'nope' })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('keeps the picture inside the repository and checks it exists and is a picture', async () => {
    setMcpAllowModelsState(true);
    setup(installed);
    const base = { repoPath: '/repo', project: 'props' };
    expect(await dispatchMcpCall('model_generate_sf3d', { ...base, imagePath: '../etc/passwd.png' })).toMatchObject({ ok: false, kind: 'refused' });
    expect(await dispatchMcpCall('model_generate_sf3d', { ...base, imagePath: '/etc/x.png' })).toMatchObject({ ok: false, kind: 'refused' });
    expect(await dispatchMcpCall('model_generate_sf3d', { ...base, imagePath: 'art/notes.txt' })).toMatchObject({ ok: false, message: expect.stringMatching(/picture/) });
    expect(await dispatchMcpCall('model_generate_sf3d', { ...base, imagePath: 'art/gone.png' })).toMatchObject({ ok: false, kind: 'not-found' });
    expect(await dispatchMcpCall('model_generate_sf3d', { ...base, repoPath: '/elsewhere', imagePath: 'a.png' })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});
