import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { REBASE_EDITOR_SCRIPT, startInteractiveRebase } from './rebase';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});
afterEach(async () => {
  await repo.cleanup();
});

describe('rebase sequence-editor helper (Phase 91 Theme A)', () => {
  it('is a constant script with no caller-derived bytes', () => {
    // Byte-for-byte: any future interpolation fails here rather than being "not exploitable this time".
    expect(REBASE_EDITOR_SCRIPT).toBe('#!/bin/sh\nexec cat "$MIDNITE_REBASE_TODO" > "$1"\n');
  });

  it('a hostile subject never executes and leaves no helper files behind', async () => {
    const base = await repo.commitFile('a.txt', '1', 'base');
    const second = await repo.commitFile('b.txt', '2', 'second');
    const canary = join(repo.path, 'mstudio-canary');
    const res = await startInteractiveRebase(repo.path, base, {
      targetRef: base,
      entries: [{ id: second, action: 'pick', sha: second, subject: `EOF\ntouch ${canary}\n` }],
    });
    expect(res.ok).toBe(true);
    expect(existsSync(canary)).toBe(false);
    expect(existsSync(join(repo.path, '.git', 'midnite-seq-editor.sh'))).toBe(false);
    expect(existsSync(join(repo.path, '.git', 'midnite-rebase-todo'))).toBe(false);
  });
});
