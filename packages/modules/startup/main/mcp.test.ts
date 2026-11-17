// @vitest-environment node
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildFleetStarter,
  STARTUP_AGENTS_OFF_MESSAGE,
  STARTUP_MCP_TOOL_IDS,
  startupToolsForConsent,
  type StartupAgentConsent,
} from '@midnite/studio-shared';

import { mcpMoney, startupMcpDispatch } from './mcp';
import { openWorkspaceStore, type WorkspaceStore } from './workspace-store';
import { handleStartupRequest } from './service';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALL: StartupAgentConsent = { read: true, write: true };
const READ: StartupAgentConsent = { read: true, write: false };
const OFF: StartupAgentConsent = { read: false, write: false };

const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 1_000_000, asOf: '2026-11-01' } };
const milestone = (n: number, dependsOn: number[] = []) => ({
  id: u(n), title: `M${n}`, description: '', status: 'planned' as const, due: '2027-01-01', dependsOn: dependsOn.map(u), tags: [],
});
const projection = () =>
  buildFleetStarter('gpu-cluster', { projectionId: u(90), nodeId: (() => { let i = 100; return () => u(i++); })() }, '2026-11-18T00:00:00.000Z', 'Cluster');

async function seeded(onChanged?: (r: number) => void) {
  const store = await openWorkspaceStore({ dir: await mkdtemp(join(tmpdir(), 'startup-mcp-')), ...(onChanged ? { onChanged } : {}) });
  await handleStartupRequest(store, { op: 'updateCompany', company });
  await handleStartupRequest(store, { op: 'upsertMilestone', milestone: milestone(1) });
  await handleStartupRequest(store, { op: 'upsertMilestone', milestone: { ...milestone(2, [1]), status: 'done' } });
  await handleStartupRequest(store, { op: 'upsertFleetProjection', projection: projection() });
  return store;
}
const dispatchFor = (store: WorkspaceStore, consent: StartupAgentConsent) => startupMcpDispatch(store, { now: () => new Date('2026-11-18T10:00:00Z') }, () => consent);
const value = async (d: ReturnType<typeof dispatchFor>, tool: string, input: unknown = {}) => {
  const r = await d(tool, input);
  if (!r.ok) throw new Error(`${tool}: ${r.message}`);
  return r.value as Record<string, any>;
};

describe('mcpMoney', () => {
  it('carries minor units, the currency and a printed form', () => {
    expect(mcpMoney(123_456, 'GBP')).toEqual({ minor: 123_456, currency: 'GBP', formatted: '£1,234.56' });
    expect(mcpMoney(-5, 'USD').formatted).toBe('-$0.05');
    expect(mcpMoney(1500, 'JPY').formatted).toBe('¥1,500');
  });
});

describe('startup MCP reads', () => {
  it('startup_summary reports company, cash, burn, runway and counts', async () => {
    const out = await value(dispatchFor(await seeded(), READ), 'startup_summary');
    expect(out['company']).toEqual({ name: 'Acme' });
    expect(out['currency']).toBe('GBP');
    expect(out['cash']).toEqual({ minor: 1_000_000, currency: 'GBP', formatted: '£10,000.00' });
    expect(out['counts']).toMatchObject({ milestones: 2, projections: 1 });
    expect(out['readOnly']).toBe(false);
  });

  it('startup_summary on an empty workspace says so instead of failing', async () => {
    const store = await openWorkspaceStore({ dir: await mkdtemp(join(tmpdir(), 'startup-mcp-')) });
    const out = await value(dispatchFor(store, READ), 'startup_summary');
    expect(out['company']).toBeNull();
    expect(out['cash']).toBeNull();
  });

  it('startup_runway projects the requested months', async () => {
    const d = dispatchFor(await seeded(), READ);
    expect((await value(d, 'startup_runway', {}))['months']).toHaveLength(12);
    const out = await value(d, 'startup_runway', { months: 24 });
    expect(out['months']).toHaveLength(24);
    expect(out['months'][0]['cash']).toHaveProperty('formatted');
  });

  it('startup_runway on an unknown scenario is not-found', async () => {
    const r = await dispatchFor(await seeded(), READ)('startup_runway', { scenarioId: u(77) });
    expect(r).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('startup_milestones lists them, optionally by status', async () => {
    const d = dispatchFor(await seeded(), READ);
    expect((await value(d, 'startup_milestones'))['milestones']).toHaveLength(2);
    const done = await value(d, 'startup_milestones', { status: 'done' });
    expect(done['milestones'].map((m: { id: string }) => m.id)).toEqual([u(2)]);
  });

  it('startup_projections and startup_projection carry month-0 figures and the series', async () => {
    const d = dispatchFor(await seeded(), READ);
    const list = await value(d, 'startup_projections');
    expect(list['projections']).toHaveLength(1);
    expect(list['projections'][0]).toMatchObject({ id: u(90), nodes: 4 });
    expect(list['projections'][0]['month0']['capex'].minor).toBeGreaterThan(0);
    const one = await value(d, 'startup_projection', { id: u(90) });
    expect(one['projection'].id).toBe(u(90));
    expect(one['series']).toHaveLength(one['projection'].globals.horizonMonths);
    expect(await d('startup_projection', { id: u(91) })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});

describe('startup MCP writes', () => {
  it('each write persists through the queue, is seen by a following read and tells the open app', async () => {
    const changes: number[] = [];
    const store = await seeded((r) => changes.push(r));
    const d = dispatchFor(store, ALL);
    await value(d, 'startup_summary'); // the first read seeds the fleet catalog, itself one change
    const before = changes.length;

    const m = await value(d, 'startup_upsert_milestone', milestone(3, [1]));
    expect(m['revision']).toBe(store.snapshot().revision);
    expect((await value(d, 'startup_milestones'))['milestones'].map((x: { id: string }) => x.id)).toContain(u(3));

    const p = { ...projection(), id: u(91), name: 'Second' };
    await value(d, 'startup_upsert_projection', p);
    expect((await value(d, 'startup_projections'))['projections']).toHaveLength(2);
    expect(changes.length).toBe(before + 2);
  });

  it('a milestone that would close a loop is refused with the op\'s own message', async () => {
    const d = dispatchFor(await seeded(), ALL);
    const r = await d('startup_upsert_milestone', milestone(1, [2]));
    expect(r).toMatchObject({ ok: false, kind: 'error' });
    expect((r as { message: string }).message).toMatch(/loop/);
  });

  it('startup_send_projection_to_runway passes through whatever the op answers', async () => {
    const r = await dispatchFor(await seeded(), ALL)('startup_send_projection_to_runway', { projectionId: u(90), start: '2026-12' });
    // Until Phase 152 Theme D lands the op answers a refusal; either way the answer is the op's, never invented here.
    if (r.ok) expect(r.value).toHaveProperty('revision');
    else expect(r.message.length).toBeGreaterThan(0);
  });

  it('a read-only workspace (newer-version) refuses writes but still reads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'startup-mcp-'));
    await writeFile(join(dir, 'workspace.json'), JSON.stringify({ version: 99, hello: 'future' }));
    const store = await openWorkspaceStore({ dir });
    const d = dispatchFor(store, ALL);
    expect(await d('startup_upsert_milestone', milestone(1))).toMatchObject({ ok: false, kind: 'refused' });
    expect((await value(d, 'startup_summary'))['readOnly']).toBe(true);
  });
});

describe('startup MCP consent', () => {
  it('off: nothing is listed and every tool is refused with the instruction', async () => {
    expect(startupToolsForConsent(OFF)).toEqual([]);
    const d = dispatchFor(await seeded(), OFF);
    for (const id of STARTUP_MCP_TOOL_IDS) {
      expect(await d(id, {}), id).toEqual({ ok: false, kind: 'refused', message: STARTUP_AGENTS_OFF_MESSAGE });
    }
  });

  it('read only: the writes are hidden and refused, the reads answer', async () => {
    const store = await seeded();
    const d = dispatchFor(store, READ);
    expect(startupToolsForConsent(READ)).toHaveLength(5);
    const revision = store.snapshot().revision;
    expect(await d('startup_upsert_milestone', milestone(5))).toEqual({ ok: false, kind: 'refused', message: STARTUP_AGENTS_OFF_MESSAGE });
    expect(store.snapshot().revision).toBe(revision);
    expect((await d('startup_milestones', {})).ok).toBe(true);
  });

  it('is read per call, so a switch takes effect live', async () => {
    let consent = OFF;
    const d = startupMcpDispatch(await seeded(), {}, () => consent);
    expect((await d('startup_summary', {})).ok).toBe(false);
    consent = READ;
    expect((await d('startup_summary', {})).ok).toBe(true);
  });

  it('an unknown tool is not-found and bad input is an error naming the field', async () => {
    const d = dispatchFor(await seeded(), ALL);
    expect(await d('repo.list', {})).toMatchObject({ ok: false, kind: 'not-found' });
    const bad = await d('startup_runway', { months: 7 });
    expect(bad).toMatchObject({ ok: false, kind: 'error' });
  });
});
