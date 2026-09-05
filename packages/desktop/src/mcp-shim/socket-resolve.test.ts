import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveMcpSocketPath } from './socket-resolve';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-mcp-socket-resolve-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('resolveMcpSocketPath', () => {
  it('returns null when the mcp directory does not exist', async () => {
    const userDataDir = await tempDir();
    expect(resolveMcpSocketPath(userDataDir)).toBeNull();
  });

  it('returns null when the mcp directory has no socket files', async () => {
    const userDataDir = await tempDir();
    await mkdir(join(userDataDir, 'mcp'), { recursive: true });
    expect(resolveMcpSocketPath(userDataDir)).toBeNull();
  });

  it('returns the single socket file when there is exactly one', async () => {
    const userDataDir = await tempDir();
    const mcpDir = join(userDataDir, 'mcp');
    await mkdir(mcpDir, { recursive: true });
    await writeFile(join(mcpDir, '1.0.0-abcd1234.sock'), '');

    expect(resolveMcpSocketPath(userDataDir)).toBe(join(mcpDir, '1.0.0-abcd1234.sock'));
  });

  it('picks the most recently modified socket file when several exist', async () => {
    const userDataDir = await tempDir();
    const mcpDir = join(userDataDir, 'mcp');
    await mkdir(mcpDir, { recursive: true });

    await writeFile(join(mcpDir, 'old-1234.sock'), '');
    await new Promise((r) => setTimeout(r, 10));
    await writeFile(join(mcpDir, 'new-5678.sock'), '');

    expect(resolveMcpSocketPath(userDataDir)).toBe(join(mcpDir, 'new-5678.sock'));
  });

  it('ignores non-socket files in the directory', async () => {
    const userDataDir = await tempDir();
    const mcpDir = join(userDataDir, 'mcp');
    await mkdir(mcpDir, { recursive: true });
    await writeFile(join(mcpDir, 'readme.txt'), 'not a socket');

    expect(resolveMcpSocketPath(userDataDir)).toBeNull();
  });
});
