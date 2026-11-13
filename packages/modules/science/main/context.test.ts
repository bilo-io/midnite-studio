// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, SCIENCE_MOLECULE_MAX_BYTES } from '@midnite/studio-shared';

import { importStructure } from './context';
import { scienceModuleMain } from './module';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('science module registration', () => {
  it('registers exactly its channel', () => {
    expect(scienceModuleMain.channels).toEqual([CHANNELS.science]);
  });

  it('answers an invalid payload with an error result, and a valid one end to end', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sci-ctx-'));
    dirs.push(dir);
    const ctx = createRecordingContext();
    scienceModuleMain.register(ctx, { userData: dir });
    expect(ctx.channels).toEqual([CHANNELS.science]);
    expect(await ctx.invoke(CHANNELS.science, { op: 'read', id: '../x' })).toMatchObject({ ok: false, kind: 'error' });
    expect(await ctx.invoke(CHANNELS.science, { op: 'list' })).toEqual({ ok: true, value: { notebooks: [], quarantined: 0 } });
    const made = await ctx.invoke(CHANNELS.science, { op: 'create', title: 'T', discipline: 'maths', cells: [] });
    expect(made).toMatchObject({ ok: true });
  });
});

describe('importStructure', () => {
  const pick = (p: string | null) => async () => (p === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [p] });

  it('answers cancelled when the dialog is dismissed', async () => {
    expect(await importStructure(pick(null))).toEqual({ ok: true, value: { cancelled: true } });
  });

  it('refuses a file over 10 MB without reading it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sci-imp-'));
    dirs.push(dir);
    const big = join(dir, 'big.xyz');
    await writeFile(big, Buffer.alloc(SCIENCE_MOLECULE_MAX_BYTES + 1, 'a'));
    expect(await importStructure(pick(big))).toEqual({ ok: false, kind: 'error', message: 'Larger than 10 MB' });
  });

  it('returns the name, mapped format and text; .sdf is mol', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sci-imp-'));
    dirs.push(dir);
    const f = join(dir, 'caffeine.sdf');
    await writeFile(f, 'text');
    expect(await importStructure(pick(f))).toEqual({ ok: true, value: { name: 'caffeine.sdf', format: 'mol', text: 'text' } });
  });
});
