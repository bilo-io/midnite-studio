// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowsManifest } from '../manifest';
import { disposeWorkflows, workflowsMain } from './index';
import { configureWorkflowsPorts } from './ports';
import { fakeWorkflowsPorts } from './testing';

const NOW = 1_700_000_000_000;

function workflow(id: string) {
  return {
    id,
    name: `Graph ${id}`,
    nodes: [{ id: 'n1', kind: 'delay', label: 'Wait', x: 0, y: 0, config: { ms: 0 } }],
    edges: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('workflows main', () => {
  let dir: string;
  let ctx: ReturnType<typeof createRecordingContext>;
  const startNodeSession = vi.fn();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'workflows-main-'));
    ctx = createRecordingContext();
    const ports = fakeWorkflowsPorts();
    workflowsMain.register(ctx, {
      ports: { ...ports, pty: { ...ports.pty, startNodeSession } },
      dataDirectory: dir,
    });
  });

  afterEach(async () => {
    await disposeWorkflows();
    configureWorkflowsPorts(null);
    await rm(dir, { recursive: true, force: true });
  });

  it('registers exactly the manifest channels', () => {
    expect([...ctx.channels].sort()).toEqual([...workflowsManifest.ipc].sort());
  });

  it('declares the run event the renderer re-fetches on', () => {
    expect(workflowsManifest.events).toEqual([EVENT_CHANNELS.workflowRunChanged]);
  });

  it('saves, lists and deletes a graph over the wire, under the data directory it was given', async () => {
    const saved = await ctx.invoke(CHANNELS.workflowSave, { workflow: workflow('w1') });
    expect(saved).toMatchObject({ ok: true, value: { id: 'w1' } });
    const listed = (await ctx.invoke(CHANNELS.workflowList)) as { workflows: { id: string }[] };
    expect(listed.workflows.map((w) => w.id)).toEqual(['w1']);
    expect(await readdir(dir)).toContain('workflows.json');
    expect(await ctx.invoke(CHANNELS.workflowDelete, { id: 'w1' })).toMatchObject({ ok: true });
  });

  it('turns an invalid payload into a failure instead of throwing', async () => {
    expect(await ctx.invoke(CHANNELS.workflowRun, { workflowId: 42 })).toMatchObject({ ok: false, kind: 'error' });
  });

  it('runs a delay-only graph to completion and announces each change, starting no session', async () => {
    await ctx.invoke(CHANNELS.workflowSave, { workflow: workflow('w2') });
    const started = (await ctx.invoke(CHANNELS.workflowRun, { workflowId: 'w2' })) as { ok: boolean };
    expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
    await vi.waitFor(async () => {
      const { runs } = (await ctx.invoke(CHANNELS.workflowRunsList, { workflowId: 'w2' })) as {
        runs: { status: string }[];
      };
      expect(runs[0]?.status).toBe('completed');
    });
    expect(ctx.emitted.some((e) => e.channel === EVENT_CHANNELS.workflowRunChanged)).toBe(true);
    expect(startNodeSession).not.toHaveBeenCalled();
  });

  it('reports the demo API as stopped until asked, and stops it cleanly', async () => {
    expect(await ctx.invoke(CHANNELS.demoApiStatus)).toEqual({ running: false });
    const started = (await ctx.invoke(CHANNELS.demoApiStart)) as { ok: boolean; value?: { running: boolean } };
    expect(started).toMatchObject({ ok: true, value: { running: true } });
    expect(await ctx.invoke(CHANNELS.demoApiStop)).toMatchObject({ ok: true });
    expect(await ctx.invoke(CHANNELS.demoApiStatus)).toEqual({ running: false });
  });
});
