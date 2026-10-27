import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MirrorConfigSchema } from './mirror-config';
import { saveMirrorConfig } from './mirror-config';
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
    await expect(createMirrorHost({ configFile: join(t.configFile, 'nope', 'x'), resolve: async () => null, warn: () => undefined }).start()).resolves.toBeUndefined();
    t.host.stop();
  });
});
