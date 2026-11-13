// @vitest-environment node
import { mkdtemp, readdir, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HealthDay } from '@midnite/studio-shared';

import { createHealthStore } from './health-store';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'health-store-'));
  dirs.push(dir);
  const trash = vi.fn(async () => undefined);
  return { dir, trash, store: createHealthStore(dir, trash) };
}

const day = (weightKg: number): HealthDay => ({ weightKg, meals: [], sessions: [] });

describe('health store', () => {
  it('putDay then getMonths returns the day', async () => {
    const { store } = await setup();
    await store.putDay('2026-11-11', day(81.3));
    const { months, quarantined } = await store.getMonths('2026-10', '2026-11');
    expect(quarantined).toBe(0);
    expect(months).toHaveLength(1);
    expect(months[0]?.id).toBe('log-2026-11');
    expect(months[0]?.days['2026-11-11']?.weightKg).toBe(81.3);
  });

  it('keeps both of two concurrent putDays on one month', async () => {
    const { store } = await setup();
    await Promise.all([store.putDay('2026-11-10', day(80)), store.putDay('2026-11-11', day(81))]);
    const days = (await store.getMonths('2026-11', '2026-11')).months[0]?.days ?? {};
    expect(Object.keys(days).sort()).toEqual(['2026-11-10', '2026-11-11']);
  });

  it('removes the key of an emptied day', async () => {
    const { store } = await setup();
    await store.putDay('2026-11-11', day(81));
    await store.putDay('2026-11-11', { meals: [], sessions: [] });
    expect((await store.getMonths('2026-11', '2026-11')).months[0]?.days).toEqual({});
  });

  it('quarantines a corrupt profile and answers null', async () => {
    const { store, dir } = await setup();
    await writeFile(join(dir, 'profile.json'), '{nope');
    expect(await store.getProfile()).toBeNull();
    expect((await readdir(dir)).some((n) => n.startsWith('profile.json.corrupt-'))).toBe(true);
  });

  it('quarantines and counts a garbage month file', async () => {
    const { store, dir } = await setup();
    await mkdir(join(dir, 'logs'));
    await writeFile(join(dir, 'logs', 'log-2026-10.json'), 'garbage');
    const res = await store.getMonths('2026-10', '2026-11');
    expect(res).toEqual({ months: [], quarantined: 1 });
    expect((await readdir(join(dir, 'logs'))).some((n) => n.includes('.corrupt-'))).toBe(true);
  });

  it('upserts and removes foods', async () => {
    const { store } = await setup();
    const food = { id: 'f-aaaaaaaa', name: 'Oats', serving: '40 g', kcal: 150, proteinG: 5, carbsG: 27, fatG: 3 };
    await store.upsertFood(food);
    await store.upsertFood({ ...food, kcal: 160 });
    expect((await store.getFoods()).map((f) => f.kcal)).toEqual([160]);
    await store.removeFood(food.id);
    expect(await store.getFoods()).toEqual([]);
  });

  it('sends removePlan and eraseAll to the Trash', async () => {
    const { store, trash, dir } = await setup();
    await store.removePlan('plan-aaaaaaaaaaaa');
    expect(trash).toHaveBeenCalledWith(join(dir, 'plans', 'plan-aaaaaaaaaaaa.json'));
    await store.eraseAll();
    expect(trash).toHaveBeenLastCalledWith(dir);
  });

  it('writes files at mode 0600', async () => {
    const { store, dir } = await setup();
    await store.putDay('2026-11-11', day(81));
    expect((await stat(join(dir, 'logs', 'log-2026-11.json'))).mode & 0o777).toBe(0o600);
  });
});
