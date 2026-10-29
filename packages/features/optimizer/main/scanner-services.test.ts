// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createScannerServices } from './index';

describe('createScannerServices (Phase 113 Theme H)', () => {
  let root: string;
  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'optimizer-services-')));
    await mkdir(join(root, 'proj', 'node_modules', 'dep'), { recursive: true });
    await writeFile(join(root, 'proj', 'package.json'), '{}');
    await writeFile(join(root, 'proj', 'node_modules', 'dep', 'index.js'), 'x'.repeat(100));
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('with no repo source, a workspace scan covers only the extra root', async () => {
    const services = createScannerServices();
    const result = await services.scanWorkspace({
      extraRoot: root,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    expect(result.items.map((i) => i.path)).toEqual([join(root, 'proj', 'node_modules')]);
    expect(result.items[0]?.bytes).toBe(100);
  });

  it('with no repo source, no root is known, so a clean trashes nothing', async () => {
    const services = createScannerServices();
    expect(await services.knownRoots()).toEqual([]);
    const trashed: string[] = [];
    const outcome = await services.cleanItems(
      [join(root, 'proj', 'node_modules')],
      await services.knownRoots(),
      async (p) => void trashed.push(p),
    );
    expect(trashed).toEqual([]);
    expect(outcome.skipped).toEqual([
      { path: join(root, 'proj', 'node_modules'), reason: 'no longer resolves under a known root' },
    ]);
  });

  it('takes the host repo source for its roots', async () => {
    const services = createScannerServices({
      repos: {
        listRepos: async () => [{ id: 'r1', path: root, name: 'r', headRef: null } as never],
        worktreesFor: async () => [
          { id: 'w', repoId: 'r1', path: join(root, 'proj'), branch: 'main', headSha: 'x', locked: false, isMain: true, prunable: false },
        ],
      },
    });
    expect(await services.knownRoots()).toEqual([join(root, 'proj')]);
  });

  it('serves the static system-cache catalogue with labels only, no paths', () => {
    const catalogue = createScannerServices().systemCatalogue();
    expect(catalogue.length).toBeGreaterThan(0);
    for (const entry of catalogue) expect(Object.keys(entry).sort()).toEqual(['ecosystem', 'entryId', 'label', 'producer', 'reclaim']);
  });
});
