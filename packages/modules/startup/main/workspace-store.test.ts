// @vitest-environment node
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASE_SCENARIO_ID, type Milestone } from '@midnite/studio-shared';

import { emptyWorkspace, migrateWorkspace, openWorkspaceStore, type Mutation } from './workspace-store';

const dir = () => mkdtemp(join(tmpdir(), 'startup-store-'));
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const milestone = (n: number): Milestone => ({ id: u(n), title: `M${n}`, description: '', status: 'planned', due: '2027-01-01', dependsOn: [], tags: [] });
const add =
  (m: Milestone) =>
  (ws: ReturnType<typeof emptyWorkspace>): Mutation => ({ ok: true, workspace: { ...ws, milestones: [...ws.milestones, m] } });

describe('migrateWorkspace', () => {
  it('treats version 1 as the identity and always has a Base scenario', () => {
    const result = migrateWorkspace({ version: 1 });
    expect(result.ok && result.workspace.scenarios.map((s) => s.id)).toEqual([BASE_SCENARIO_ID]);
  });
  it('flags a newer version and a corrupt file', () => {
    expect(migrateWorkspace({ version: 2 })).toEqual({ ok: false, reason: 'newer-version' });
    expect(migrateWorkspace({ version: 1, milestones: 'nope' })).toEqual({ ok: false, reason: 'corrupt' });
    expect(migrateWorkspace(null)).toEqual({ ok: false, reason: 'corrupt' });
  });
});

describe('openWorkspaceStore', () => {
  it('starts empty, and a write then a reopen gives an equal workspace', async () => {
    const d = await dir();
    const first = await openWorkspaceStore({ dir: d });
    expect(first.snapshot()).toMatchObject({ revision: 0, readOnly: false });
    const written = await first.mutate(add(milestone(1)));
    expect(written.ok && written.value.revision).toBe(1);
    const second = await openWorkspaceStore({ dir: d });
    expect(second.snapshot().workspace).toEqual(first.snapshot().workspace);
  });

  it('serialises ten concurrent upserts into ten records and bumps the revision each time', async () => {
    const d = await dir();
    const seen: number[] = [];
    const store = await openWorkspaceStore({ dir: d, onChanged: (r) => seen.push(r) });
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.mutate(add(milestone(i + 1)))));
    expect(store.snapshot().workspace.milestones).toHaveLength(10);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const reopened = await openWorkspaceStore({ dir: d });
    expect(reopened.snapshot().workspace.milestones).toHaveLength(10);
    expect((await readdir(d)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('leaves the stored workspace alone when a mutation refuses', async () => {
    const store = await openWorkspaceStore({ dir: await dir() });
    const result = await store.mutate(() => ({ ok: false, kind: 'invalid', message: 'no' }));
    expect(result).toEqual({ ok: false, kind: 'invalid', message: 'no' });
    expect(store.snapshot().revision).toBe(0);
  });

  it('opens a version 2 file read-only and never rewrites it', async () => {
    const d = await dir();
    const file = join(d, 'workspace.json');
    await writeFile(file, JSON.stringify({ version: 2, hello: 'future' }));
    const store = await openWorkspaceStore({ dir: d });
    expect(store.snapshot().readOnly).toBe(true);
    const result = await store.mutate(add(milestone(1)));
    expect(result).toMatchObject({ ok: false, kind: 'newer-version', message: 'This workspace was written by a newer Midnite Startup.' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 2, hello: 'future' });
  });

  it('moves a garbage file aside and starts empty', async () => {
    const d = await dir();
    await writeFile(join(d, 'workspace.json'), '{ not json');
    const warnings: string[] = [];
    const store = await openWorkspaceStore({ dir: d, now: () => 42, warn: (m) => warnings.push(m) });
    expect(store.snapshot().workspace.milestones).toEqual([]);
    expect(await readdir(d)).toEqual(['workspace.corrupt-42.json']);
    expect(warnings).toHaveLength(1);
    expect((await store.mutate(add(milestone(1)))).ok).toBe(true);
  });
});
