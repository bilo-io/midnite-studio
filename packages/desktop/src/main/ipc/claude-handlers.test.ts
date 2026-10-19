import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {}, shell: { showItemInFolder: vi.fn() } }));
vi.mock('../claude-cli', () => ({ getClaudeInfo: vi.fn(), runClaudeUpdate: vi.fn() }));
vi.mock('./handle', () => ({ handle: vi.fn(), handleBare: vi.fn() }));

import { isRevealablePath } from './claude-handlers';

describe('isRevealablePath (Phase 91 Theme E)', () => {
  it('accepts an executable file and refuses data files, directories, relative and missing paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reveal-'));
    const bin = join(dir, 'claude');
    const data = join(dir, 'id_ed25519');
    await writeFile(bin, '#!/bin/sh\n');
    await chmod(bin, 0o755);
    await writeFile(data, 'secret');
    await chmod(data, 0o600);
    expect(await isRevealablePath(bin)).toBe(true);
    expect(await isRevealablePath(data)).toBe(false);
    expect(await isRevealablePath(dir)).toBe(false);
    expect(await isRevealablePath('claude')).toBe(false);
    expect(await isRevealablePath(join(dir, 'missing'))).toBe(false);
  });

  it('judges a symlink by its target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reveal-'));
    const data = join(dir, 'data');
    await writeFile(data, 'x');
    await symlink(data, join(dir, 'link'));
    expect(await isRevealablePath(join(dir, 'link'))).toBe(false);
  });
});
