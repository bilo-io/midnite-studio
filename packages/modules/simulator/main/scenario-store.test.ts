// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, type SimScenarioDraft } from '@midnite/studio-shared';

import { simulatorModuleMain } from './module';
import { createScenarioStore } from './scenario-store';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const draft = (over: Partial<SimScenarioDraft> = {}): SimScenarioDraft => ({ kind: 'life', title: 'Glider', seed: 7, params: { rule: 'B3/S23' }, ...over });

async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'sim-'));
  dirs.push(base);
  const trashed: string[] = [];
  return { base, store: createScenarioStore(join(base, 'simulations'), async (p) => void trashed.push(p)), trashed };
}

describe('scenario store', () => {
  it('saves, lists filtered by kind, and reads', async () => {
    const { store } = await setup();
    const a = await store.save({ scenario: draft() });
    await store.save({ scenario: draft({ kind: 'nbody', title: 'Orbit' }) });
    if (!a.ok) throw new Error('save failed');
    expect(a.value.scenario.id).toMatch(/^sim-[a-z0-9]{12}$/);
    const life = await store.list('life');
    expect(life.ok && life.value.scenarios).toEqual([expect.objectContaining({ id: a.value.scenario.id, kind: 'life', title: 'Glider' })]);
    const all = await store.list();
    expect(all.ok && all.value.scenarios).toHaveLength(2);
    const read = await store.read(a.value.scenario.id);
    expect(read.ok && read.value.scenario.params).toEqual({ rule: 'B3/S23' });
  });

  it('overwrites by id keeping createdAt, and refuses an unknown id', async () => {
    const { store } = await setup();
    const a = await store.save({ scenario: draft() });
    if (!a.ok) throw new Error('save failed');
    const b = await store.save({ id: a.value.scenario.id, scenario: draft({ title: 'Glider 2', state: { generation: 5 } }) });
    expect(b.ok && b.value.scenario).toMatchObject({ id: a.value.scenario.id, title: 'Glider 2', createdAt: a.value.scenario.createdAt });
    expect(await store.save({ id: 'sim-aaaaaaaaaaaa', scenario: draft() })).toMatchObject({ ok: false });
  });

  it('renames and moves to the Trash on remove', async () => {
    const { store, trashed } = await setup();
    const a = await store.save({ scenario: draft() });
    if (!a.ok) throw new Error('save failed');
    expect(await store.rename(a.value.scenario.id, 'Renamed')).toEqual({ ok: true });
    const read = await store.read(a.value.scenario.id);
    expect(read.ok && read.value.scenario.title).toBe('Renamed');
    expect(await store.remove(a.value.scenario.id)).toEqual({ ok: true });
    expect(trashed).toHaveLength(1);
    expect(trashed[0]).toContain(a.value.scenario.id);
  });

  it('refuses a scenario over 8 MB', async () => {
    const { store } = await setup();
    const big = await store.save({ scenario: draft({ state: { blob: 'x'.repeat(9 * 1024 * 1024) } }) });
    expect(big).toEqual({ ok: false, kind: 'error', message: 'Scenario is larger than 8 MB' });
  });
});

describe('simulator module registration', () => {
  it('registers exactly its channel and answers end to end', async () => {
    expect(simulatorModuleMain.channels).toEqual([CHANNELS.simulator]);
    const dir = await mkdtemp(join(tmpdir(), 'sim-ctx-'));
    dirs.push(dir);
    const ctx = createRecordingContext();
    simulatorModuleMain.register(ctx, { userData: dir });
    expect(await ctx.invoke(CHANNELS.simulator, { op: 'read', id: '../x' })).toMatchObject({ ok: false, kind: 'error' });
    expect(await ctx.invoke(CHANNELS.simulator, { op: 'list' })).toEqual({ ok: true, value: { scenarios: [], quarantined: 0 } });
    expect(await ctx.invoke(CHANNELS.simulator, { op: 'save', scenario: draft() })).toMatchObject({ ok: true });
  });
});
