// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { healthModuleMain } from './module';

const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function setup(services: { showSaveDialog?: Parameters<typeof healthModuleMain.register>[1]['showSaveDialog'] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'health-ctx-'));
  dirs.push(dir);
  const ctx = createRecordingContext();
  healthModuleMain.register(ctx, { userData: dir, ...services });
  return { dir, ctx };
}

const putDay = (date: string, weightKg: number) => ({ op: 'putDay', date, day: { weightKg, meals: [], sessions: [] } });

describe('health module registration', () => {
  it('registers exactly its channel', async () => {
    expect(healthModuleMain.channels).toEqual([CHANNELS.health]);
    const { ctx } = await setup();
    expect(ctx.channels).toEqual([CHANNELS.health]);
  });

  it('answers an invalid payload with an error result', async () => {
    const { ctx } = await setup();
    expect(await ctx.invoke(CHANNELS.health, { op: 'putDay', date: 'x' })).toMatchObject({ ok: false, kind: 'error' });
    expect(await ctx.invoke(CHANNELS.health, { op: 'nope' })).toMatchObject({ ok: false });
  });

  it('round-trips a day end to end', async () => {
    const { ctx } = await setup();
    expect(await ctx.invoke(CHANNELS.health, putDay('2026-11-11', 80))).toMatchObject({ ok: true });
    const res = (await ctx.invoke(CHANNELS.health, { op: 'getMonths', from: '2026-11', to: '2026-11' })) as {
      value: { months: { days: Record<string, { weightKg: number }> }[] };
    };
    expect(res.value.months[0]?.days['2026-11-11']?.weightKg).toBe(80);
  });

  it('answers a store throw as { ok: false } and logs no payload value', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'health-ctx-'));
    dirs.push(dir);
    const ctx = createRecordingContext();
    // userData is a file, so the store cannot make its directories.
    const blocker = join(dir, 'file');
    await (await import('node:fs/promises')).writeFile(blocker, 'x');
    healthModuleMain.register(ctx, { userData: blocker });
    const spies = [vi.spyOn(console, 'error').mockImplementation(() => undefined), vi.spyOn(console, 'log').mockImplementation(() => undefined), vi.spyOn(console, 'warn').mockImplementation(() => undefined)];
    const res = await ctx.invoke(CHANNELS.health, putDay('2026-11-11', 81.3));
    expect(res).toMatchObject({ ok: false, kind: 'error' });
    const logged = spies.flatMap((s) => s.mock.calls).flat().join(' ');
    expect(logged).toContain('health:putDay failed');
    expect(logged).not.toContain('81.3');
    expect(JSON.stringify(res)).not.toContain('81.3');
  });

  it('answers cancelled when the save dialog is dismissed or absent', async () => {
    const dismissed = await setup({ showSaveDialog: async () => ({ canceled: true }) });
    expect(await dismissed.ctx.invoke(CHANNELS.health, { op: 'exportAll' })).toEqual({ ok: true, value: { cancelled: true } });
    const absent = await setup();
    expect(await absent.ctx.invoke(CHANNELS.health, { op: 'exportAll' })).toEqual({ ok: true, value: { cancelled: true } });
  });

  it('exports every file as one 0600 JSON document', async () => {
    const out = await mkdtemp(join(tmpdir(), 'health-out-'));
    dirs.push(out);
    const file = join(out, 'x.json');
    const { ctx } = await setup({ showSaveDialog: async () => ({ canceled: false, filePath: file }) });
    await ctx.invoke(CHANNELS.health, putDay('2026-11-11', 80));
    expect(await ctx.invoke(CHANNELS.health, { op: 'exportAll' })).toEqual({ ok: true, value: { path: file } });
    const json = JSON.parse(await readFile(file, 'utf8')) as { format: string; months: { id: string }[] };
    expect(json.format).toBe('midnite-health-export');
    expect(json.months[0]?.id).toBe('log-2026-11');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});
