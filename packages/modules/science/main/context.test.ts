// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

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
