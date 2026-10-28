import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MirrorConfigSchema } from './mirror-config';
import { loadMirrorConfig, saveMirrorConfig, updateMirrorConfig } from './mirror-config';
import { createMirrorHost } from './mirror-host';
import type { MirrorResult } from './mirror-refresh';

const repo = { host: 'github.com', owner: 'o', repo: 'r', url: 'https://github.com/o/r.git' };

async function setup(resolve: Parameters<typeof createMirrorHost>[0]['resolve']) {
  const dir = await mkdtemp(join(tmpdir(), 'mirror-host-'));
  const configFile = join(dir, 'mirrors.json');
  await saveMirrorConfig(configFile, MirrorConfigSchema.parse({ root: join(dir, 'm'), interval: 'manual', repos: [repo], picked: true }));
  const calls: { source: unknown; root: string }[] = [];
  const warnings: string[] = [];
  const host = createMirrorHost({
    configFile,
    defaultBranch: async () => ({ ref: 'refs/heads/main', sha: 'a'.repeat(40) }),
    resolve,
    warn: (m) => warnings.push(m),
    refresh: async (o): Promise<MirrorResult> => {
      calls.push({ source: o.source, root: o.root });
      return { key: `${o.repo.host}/${o.repo.owner}/${o.repo.repo}`, status: 'ok', at: '2026-10-27T00:00:00.000Z', incremental: false, refs: 2 };
    },
  });
  return { host, configFile, calls, warnings };
}

describe('mirror host', () => {
  it('composes a metadata source from the resolved adapter and records the outcome in mirrors.json', async () => {
    const adapter = { kind: 'github' } as never;
    const t = await setup(async () => ({ forge: { host: 'github.com', owner: 'o', repo: 'r', kind: 'github' }, adapter, account: 'bilo' }));
    const results = await t.host.runNow();
    expect(results).toHaveLength(1);
    expect(t.calls[0]?.source).toMatchObject({ adapter: 'github', account: 'bilo' });
    const saved = JSON.parse(await readFile(t.configFile, 'utf8'));
    expect(saved.state['github.com/o/r']).toEqual({ at: '2026-10-27T00:00:00.000Z', status: 'ok' });
    expect(saved.picked).toBe(true);
  });

  it('mirrors refs only when no adapter resolves, and survives a throwing resolver', async () => {
    const none = await setup(async () => null);
    await none.host.runNow();
    expect(none.calls[0]?.source).toBeUndefined();

    const boom = await setup(async () => {
      throw new Error('no token');
    });
    await boom.host.runNow();
    expect(boom.calls[0]?.source).toBeUndefined();
    expect(boom.warnings[0]).toMatch(/refs only/);
  });

  it('start() never rejects on an unreadable config, and stop() is safe', async () => {
    const t = await setup(async () => null);
    const broken = createMirrorHost({ configFile: join(t.configFile, 'nope', 'x'), resolve: async () => null, warn: () => undefined, setTimer: () => 1, clearTimer: () => undefined });
    await expect(broken.start()).resolves.toBeUndefined();
    broken.stop();
    t.host.stop();
  });

  it('supplies the forge default branch to the metadata source', async () => {
    const t = await setup(async () => ({ forge: { host: 'github.com', owner: 'o', repo: 'r', kind: 'github' }, adapter: { kind: 'github' } as never, account: 'bilo' }));
    await t.host.runNow();
    const source = t.calls[0]?.source as { defaultBranch: () => Promise<unknown> };
    expect(await source.defaultBranch()).toEqual({ ref: 'refs/heads/main', sha: 'a'.repeat(40) });
  });

  it('records only state, keeping a selection saved while the run was in flight', async () => {
    const t = await setup(async () => null);
    const other = { host: 'github.com', owner: 'o', repo: 'other', url: 'https://github.com/o/other.git' };
    // a picker saving a new selection between the scheduler's load and the record
    await updateMirrorConfig(t.configFile, (c) => ({ ...c, repos: [...c.repos, other], interval: 'weekly' }));
    await t.host.runNow();
    const saved = await loadMirrorConfig(t.configFile);
    expect(saved.repos).toHaveLength(2);
    expect(saved.interval).toBe('weekly');
    expect(saved.state['github.com/o/r']?.status).toBe('ok');
  });

  it('prunes state of repos no longer selected and ignores a run that finished after de-selection', async () => {
    const t = await setup(async () => null);
    await updateMirrorConfig(t.configFile, (c) => ({ ...c, state: { 'github.com/o/gone': { at: 'x', status: 'ok' } } }));
    await t.host.runNow();
    expect(Object.keys((await loadMirrorConfig(t.configFile)).state)).toEqual(['github.com/o/r']);

    // de-select, then a result for the removed repo arrives
    await updateMirrorConfig(t.configFile, (c) => ({ ...c, repos: [] }));
    const late = createMirrorHost({
      configFile: t.configFile,
      resolve: async () => null,
      refresh: async () => ({ key: 'github.com/o/r', status: 'ok', at: 'y', incremental: false, refs: 1 }),
    });
    await updateMirrorConfig(t.configFile, (c) => ({ ...c, repos: [repo] }));
    const running = late.runNow();
    await updateMirrorConfig(t.configFile, (c) => ({ ...c, repos: [] }));
    await running;
    expect((await loadMirrorConfig(t.configFile)).state).toEqual({});
  });

  it('does not reject or re-run a repo whose state could not be persisted (invalid mirrors.json)', async () => {
    const t = await setup(async () => null);
    let runs = 0;
    const warnings: string[] = [];
    const host = createMirrorHost({
      configFile: t.configFile,
      resolve: async () => null,
      warn: (m) => warnings.push(m),
      refresh: async () => {
        runs += 1;
        await writeFile(t.configFile, '{ not json'); // the file turns invalid mid-run
        return { key: 'github.com/o/r', status: 'ok', at: '2026-10-27T00:00:00.000Z', incremental: false, refs: 1 };
      },
    });
    const results = await host.runNow();
    expect(results.map((r) => r.status)).toEqual(['ok']);
    expect(runs).toBe(1);
    expect(warnings.join('\n')).toMatch(/could not be saved/);
  });
});
