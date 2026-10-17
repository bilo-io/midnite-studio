// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTerrainRuntime, type TerrainRuntimeDeps } from './terrain-runtime';

const deps = (over: Partial<TerrainRuntimeDeps> = {}): TerrainRuntimeDeps => ({
  rootFor: async () => null,
  writeBytes: async () => ({ ok: true, value: undefined }),
  trash: async () => undefined,
  toPng: async () => null,
  onChanged: () => undefined,
  emitProgress: () => undefined,
  emitChanged: () => undefined,
  log: () => undefined,
  spawnWorker: () => {
    throw new Error('no worker in a unit test');
  },
  ...over,
});

describe('createTerrainRuntime', () => {
  it('forks the worker lazily: building the runtime and disposing it spawn nothing', () => {
    const spawnWorker = vi.fn();
    const runtime = createTerrainRuntime(deps({ spawnWorker }));
    expect(() => runtime.dispose()).not.toThrow();
    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it('answers a terrain it cannot find as a failure, not a throw', async () => {
    const runtime = createTerrainRuntime(deps());
    const result = await runtime.service.get({ repoId: 'nope', project: 'p', terrain: 't' });
    expect(result).toMatchObject({ ok: false });
  });
});
