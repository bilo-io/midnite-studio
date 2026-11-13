// @vitest-environment node
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ScienceCell } from '@midnite/studio-shared';

import { createNotebookStore } from './notebook-store';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const md = (source: string): ScienceCell => ({ kind: 'markdown', id: 'c-aaaaaaaa', source });

async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'nb-'));
  dirs.push(base);
  const dir = join(base, 'notebooks');
  const trashed: string[] = [];
  const store = createNotebookStore(dir, async (p) => void trashed.push(p));
  return { dir, store, trashed };
}

describe('notebook store', () => {
  it('creates, lists and reads a notebook', async () => {
    const { store } = await setup();
    const made = await store.create({ title: 'Kinematics', discipline: 'physics', cells: [md('# hi')] });
    if (!made.ok) throw new Error('create failed');
    expect(made.value.notebook.id).toMatch(/^nb-[a-z0-9]{12}$/);
    const list = await store.list();
    expect(list.ok && list.value.notebooks).toEqual([
      expect.objectContaining({ id: made.value.notebook.id, title: 'Kinematics', discipline: 'physics', cellCount: 1 }),
    ]);
    const read = await store.read(made.value.notebook.id);
    expect(read.ok && read.value.notebook.cells).toEqual([md('# hi')]);
  });

  it('writes new cells, stamping updatedAt itself', async () => {
    const { store } = await setup();
    const made = await store.create({ title: 'T', discipline: 'maths', cells: [] });
    if (!made.ok) throw new Error('create failed');
    const nb = { ...made.value.notebook, cells: [md('x')], updatedAt: '1999-01-01T00:00:00.000Z' };
    const written = await store.write(nb);
    expect(written.ok && written.value.updatedAt).not.toBe('1999-01-01T00:00:00.000Z');
    const read = await store.read(nb.id);
    expect(read.ok && read.value.notebook.cells).toHaveLength(1);
  });

  it('renames', async () => {
    const { store } = await setup();
    const made = await store.create({ title: 'Old', discipline: 'general', cells: [] });
    if (!made.ok) throw new Error('create failed');
    expect((await store.rename(made.value.notebook.id, 'New')).ok).toBe(true);
    const read = await store.read(made.value.notebook.id);
    expect(read.ok && read.value.notebook.title).toBe('New');
  });

  it('quarantines a garbage file', async () => {
    const { dir, store } = await setup();
    await store.create({ title: 'T', discipline: 'maths', cells: [] });
    writeFileSync(join(dir, 'nb-zzzzzzzzzzzz.json'), 'garbage');
    const list = await store.list();
    expect(list.ok && list.value.quarantined).toBe(1);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('moves a removed notebook to the Trash through the injected function', async () => {
    const { dir, store, trashed } = await setup();
    const made = await store.create({ title: 'T', discipline: 'maths', cells: [] });
    if (!made.ok) throw new Error('create failed');
    expect((await store.remove(made.value.notebook.id)).ok).toBe(true);
    expect(trashed).toEqual([join(dir, `${made.value.notebook.id}.json`)]);
    expect(existsSync(join(dir, `${made.value.notebook.id}.json`))).toBe(true);
  });

  it('refuses a write for an unknown id', async () => {
    const { store } = await setup();
    const res = await store.write({
      version: 1,
      id: 'nb-aaaaaaaaaaaa',
      title: 'T',
      discipline: 'maths',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      cells: [],
    });
    expect(res.ok).toBe(false);
  });
});
