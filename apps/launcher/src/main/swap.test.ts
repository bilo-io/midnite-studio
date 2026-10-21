import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { swapIntoPlace } from './swap';

let root: string;
const paths = () => ({ staged: join(root, '.x.new'), dest: join(root, 'x'), backup: join(root, '.x.old') });

async function copy(dir: string, label: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'label'), label);
}
const label = (dir: string) => readFile(join(dir, 'label'), 'utf8');
const ok = async () => null;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'launcher-swap-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('swapIntoPlace', () => {
  it('moves the staged copy in and drops the backup on commit', async () => {
    await copy(paths().dest, 'old');
    await copy(paths().staged, 'new');
    const swapped = await swapIntoPlace(paths(), ok);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    await swapped.commit();
    expect(await label(paths().dest)).toBe('new');
    expect(await readdir(root)).toEqual(['x']);
  });

  it('puts the previous copy back on revert — how a bundle follows its failed stub back out', async () => {
    await copy(paths().dest, 'old');
    await copy(paths().staged, 'new');
    const swapped = await swapIntoPlace(paths(), ok);
    if (!swapped.ok) throw new Error('expected ok');
    await swapped.revert();
    expect(await label(paths().dest)).toBe('old');
    expect(await readdir(root)).toEqual(['x']);
  });

  it('restores the previous copy when the swapped-in one fails verification', async () => {
    await copy(paths().dest, 'old');
    await copy(paths().staged, 'new');
    const swapped = await swapIntoPlace(paths(), async (p) => ((await label(p)) === 'new' ? 'bad' : null));
    expect(swapped).toEqual({ ok: false, message: expect.stringMatching(/failed verification/) });
    expect(await label(paths().dest)).toBe('old');
  });

  it('installs fresh when there was nothing before, and reverts to nothing', async () => {
    await copy(paths().staged, 'new');
    const swapped = await swapIntoPlace(paths(), ok);
    if (!swapped.ok) throw new Error('expected ok');
    await swapped.revert();
    expect(await readdir(root)).toEqual([]);
  });
});
