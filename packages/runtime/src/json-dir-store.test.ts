// @vitest-environment node
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createJsonDirStore } from './json-dir-store';

type Item = { id: string; updatedAt: string; n: number };
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'jds-'));
  dirs.push(base);
  const dir = join(base, 'items');
  const store = createJsonDirStore<Item>({
    dir,
    prefix: 'it-',
    idPattern: /^it-[a-z0-9]{12}$/,
    parse: (raw) => {
      const r = raw as Partial<Item> | null;
      return r && typeof r.id === 'string' && typeof r.updatedAt === 'string' && typeof r.n === 'number' ? (r as Item) : null;
    },
  });
  return { dir, store };
}

describe('createJsonDirStore', () => {
  it('writes, lists newest first and reads back', async () => {
    const { store } = await setup();
    const a = store.mintId();
    const b = store.mintId();
    expect(a).toMatch(/^it-[a-z0-9]{12}$/);
    await store.write({ id: a, updatedAt: '2026-01-01T00:00:00.000Z', n: 1 });
    await store.write({ id: b, updatedAt: '2026-02-01T00:00:00.000Z', n: 2 });
    const { items, quarantined } = await store.list();
    expect(items.map((i) => i.n)).toEqual([2, 1]);
    expect(quarantined).toBe(0);
    expect((await store.read(a))?.n).toBe(1);
    expect(await store.exists(a)).toBe(true);
    expect(await store.exists('it-aaaaaaaaaaaa')).toBe(false);
  });

  it('quarantines a garbage file, keeping it as .corrupt-*', async () => {
    const { dir, store } = await setup();
    await store.write({ id: store.mintId(), updatedAt: '2026-01-01T00:00:00.000Z', n: 1 });
    writeFileSync(join(dir, 'it-zzzzzzzzzzzz.json'), '{not json');
    const { items, quarantined } = await store.list();
    expect(items).toHaveLength(1);
    expect(quarantined).toBe(1);
    expect(readdirSync(dir).some((f) => f.startsWith('it-zzzzzzzzzzzz.json.corrupt-'))).toBe(true);
    expect(existsSync(join(dir, 'it-zzzzzzzzzzzz.json'))).toBe(false);
  });

  it('refuses an id outside the pattern', async () => {
    const { store } = await setup();
    expect(() => store.pathOf('../x')).toThrow();
    await expect(store.write({ id: '../x', updatedAt: '', n: 0 })).rejects.toThrow();
  });

  it('writes private files', async () => {
    const { store } = await setup();
    const id = store.mintId();
    await store.write({ id, updatedAt: '2026-01-01T00:00:00.000Z', n: 1 });
    expect(statSync(store.pathOf(id)).mode & 0o777).toBe(0o600);
  });
});
