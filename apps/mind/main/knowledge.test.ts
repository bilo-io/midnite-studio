// @vitest-environment node
// vitest: handlers registered on a recording context over a temp cache directory; the layout is injected.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LayoutPositions } from '@midnite/studio-knowledge';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, type Note } from '@midnite/studio-shared';

import { MIND_KNOWLEDGE_CHANNELS, registerMindKnowledge } from './knowledge';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const note = (id: string, body: string): Note => ({
  id, repoId: 'mind', body, status: 'captured', done: false, createdAt: 1, updatedAt: 1, order: 0,
});

async function setup(notes: Note[]) {
  const cacheDirectory = await mkdtemp(join(tmpdir(), 'mind-knowledge-'));
  dirs.push(cacheDirectory);
  const ctx = createRecordingContext();
  const layout = vi.fn((lean: { nodes: { id: string }[] }): LayoutPositions =>
    Object.fromEntries(lean.nodes.map((n, i) => [n.id, { x: i, y: i }])));
  const current = { notes };
  registerMindKnowledge(ctx, { notes: async () => current.notes, cacheDirectory, layout });
  return { ctx, layout, current };
}

describe('registerMindKnowledge', () => {
  it('registers the three Knowledge channels', async () => {
    const { ctx } = await setup([]);
    expect([...ctx.channels].sort()).toEqual([...MIND_KNOWLEDGE_CHANNELS].sort());
  });

  it('answers absent for an empty notebook, and reports whether a graph exists', async () => {
    const { ctx, layout, current } = await setup([]);
    expect(await ctx.invoke(CHANNELS.knowledgeGetGraph, { repoId: 'mind' })).toEqual({ ok: false, kind: 'absent' });
    expect(await ctx.invoke(CHANNELS.knowledgeCheckGraph, { repoId: 'mind' })).toEqual({ exists: false });
    expect(layout).not.toHaveBeenCalled();
    current.notes = [note('a', 'first')];
    expect(await ctx.invoke(CHANNELS.knowledgeCheckGraph, { repoId: 'mind' })).toEqual({ exists: true });
  });

  it('lays the notebook out once, then serves an unchanged notebook from the cache', async () => {
    const { ctx, layout, current } = await setup([note('a', 'Alpha #x'), note('b', 'Beta #x')]);
    const first = (await ctx.invoke(CHANNELS.knowledgeGetGraph, { repoId: 'mind' })) as { ok: true; value: { nodes: unknown[]; cached: boolean; commitsBehind: number } };
    expect(first.ok).toBe(true);
    expect(first.value.nodes).toHaveLength(3);
    expect(first.value).toMatchObject({ cached: false, commitsBehind: 0 });
    const second = (await ctx.invoke(CHANNELS.knowledgeGetGraph, { repoId: 'mind' })) as typeof first;
    expect(second.value.cached).toBe(true);
    expect(layout).toHaveBeenCalledTimes(1);
    current.notes = [note('a', 'Alpha edited #x'), note('b', 'Beta #x')];
    const third = (await ctx.invoke(CHANNELS.knowledgeGetGraph, { repoId: 'mind' })) as typeof first;
    expect(third.value.cached).toBe(false);
    expect(layout).toHaveBeenCalledTimes(2);
  });

  it('turns a failing layout into an error result, never a throw', async () => {
    const { ctx, layout } = await setup([note('a', 'x')]);
    layout.mockImplementation(() => {
      throw new Error('layout blew up');
    });
    expect(await ctx.invoke(CHANNELS.knowledgeGetGraph, { repoId: 'mind' })).toMatchObject({ ok: false, kind: 'error', message: 'layout blew up' });
  });

  it("serves a note node's source for the detail panel, and not-found for a tag", async () => {
    const { ctx } = await setup([note('a', 'Alpha #x')]);
    expect(await ctx.invoke(CHANNELS.knowledgeGetNodeDetail, { repoId: 'mind', nodeId: 'note:a' })).toMatchObject({ ok: true, value: { sourceFile: 'a' } });
    expect(await ctx.invoke(CHANNELS.knowledgeGetNodeDetail, { repoId: 'mind', nodeId: 'nope' })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});
