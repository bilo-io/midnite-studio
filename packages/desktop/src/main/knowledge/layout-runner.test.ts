import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveLayoutWorkerPath } from './layout-runner';

describe('resolveLayoutWorkerPath', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `layout-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('prefers bundled worker when knowledge-layout-worker.js exists in the provided dir', () => {
    const workerFile = join(testDir, 'knowledge-layout-worker.js');
    writeFileSync(workerFile, '// bundled worker');

    const resolved = resolveLayoutWorkerPath(testDir);
    expect(resolved).toBe(workerFile);
  });

  it('falls back to unbundled layout-worker.js in packages/knowledge when bundled file does not exist', () => {
    const resolved = resolveLayoutWorkerPath(testDir);
    // In our repo/workspace, @midnite/studio-knowledge resolves to packages/knowledge/dist/index.js,
    // so layout-worker.js is found beside it.
    if (existsSync(join(testDir, 'knowledge-layout-worker.js'))) {
      expect(resolved).toBe(join(testDir, 'knowledge-layout-worker.js'));
    } else {
      expect(resolved).toContain('layout-worker.js');
    }
  });
});
