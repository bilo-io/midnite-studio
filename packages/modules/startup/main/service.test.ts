// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASE_SCENARIO_ID, buildFleetStarter, MAX_FLEET_PROJECTIONS, type StartupRequest } from '@midnite/studio-shared';

import { handleStartupRequest } from './service';
import { openWorkspaceStore, type WorkspaceStore } from './workspace-store';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const open = async (): Promise<WorkspaceStore> => openWorkspaceStore({ dir: await mkdtemp(join(tmpdir(), 'startup-svc-')) });
const run = (store: WorkspaceStore, request: StartupRequest) => handleStartupRequest(store, request);

const milestone = (n: number, dependsOn: number[] = []) => ({
  id: u(n), title: `M${n}`, description: '', status: 'planned' as const, due: '2027-01-01', dependsOn: dependsOn.map(u), tags: [],
});
const company = (currency = 'GBP') => ({ name: 'Acme', currency, address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 100000, asOf: '2026-11-01' } });
const vendor = { id: u(20), name: 'Cloud', category: 'software' as const, notes: '' };
const customer = { id: u(30), name: 'Client', address: '' };
const invoice = (status: 'draft' | 'issued' = 'draft') => ({
  id: u(40), number: null, customerId: u(30), issueDate: null, dueDate: null, notes: '', status, entries: {},
  lines: [{ description: 'Work', quantityMilli: 1000, unitMinor: 100, taxRateBp: 0 }],
});

describe('send to Runway', () => {
  const seed = async (withCompany = true) => {
    const s = await open();
    if (withCompany) await run(s, { op: 'updateCompany', company: company('USD') });
    await run(s, { op: 'get' });
    const p = buildFleetStarter('gpu-cluster', { projectionId: u(1), nodeId: () => u(9000) }, '2020-01-01T00:00:00.000Z', 'P');
    await run(s, { op: 'upsertFleetProjection', projection: p });
    return s;
  };
  const linked = (s: WorkspaceStore) => s.snapshot().workspace.lines.filter((l) => l.source?.projectionId === u(1));
  it('send twice leaves exactly one set of lines, beside hand-made ones', async () => {
    const s = await seed();
    const hand = { id: u(77), kind: 'cost' as const, name: 'Rent', category: 'premises' as const, minor: 500, cadence: 'monthly' as const, start: '2026-12', growthBpPerMonth: 0 };
    await run(s, { op: 'upsertLine', line: hand });
    expect((await run(s, { op: 'sendFleetProjectionToRunway', projectionId: u(1), start: '2026-12' })).ok).toBe(true);
    const first = linked(s).length;
    expect(first).toBeGreaterThanOrEqual(2);
    await run(s, { op: 'sendFleetProjectionToRunway', projectionId: u(1), start: '2027-01' });
    expect(linked(s)).toHaveLength(first);
    expect(linked(s).every((l) => l.start === '2027-01')).toBe(true);
    expect(s.snapshot().workspace.lines.some((l) => l.id === u(77))).toBe(true);
    expect(s.snapshot().workspace.scenarios.every((sc) => sc.extraLines.length === 0)).toBe(true);
  });
  it('unlink keeps the lines as ordinary ones, or removes them', async () => {
    const s = await seed();
    await run(s, { op: 'sendFleetProjectionToRunway', projectionId: u(1), start: '2026-12' });
    const n = linked(s).length;
    await run(s, { op: 'unlinkFleetProjectionLines', projectionId: u(1), removeLines: false });
    expect(linked(s)).toHaveLength(0);
    expect(s.snapshot().workspace.lines).toHaveLength(n);
    await run(s, { op: 'sendFleetProjectionToRunway', projectionId: u(1), start: '2026-12' });
    await run(s, { op: 'unlinkFleetProjectionLines', projectionId: u(1), removeLines: true });
    expect(linked(s)).toHaveLength(0);
    expect(s.snapshot().workspace.lines).toHaveLength(n);
  });
  it('refuses without a company and for an unknown projection', async () => {
    const s = await seed(false);
    expect(await run(s, { op: 'sendFleetProjectionToRunway', projectionId: u(1), start: '2026-12' })).toMatchObject({ ok: false, kind: 'invalid', message: 'Set up your company first — Runway needs it.' });
    expect(await run(s, { op: 'sendFleetProjectionToRunway', projectionId: u(2), start: '2026-12' })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});

describe('fleet catalog', () => {
  it('seeds exactly once on the first get, in the money currency', async () => {
    const s = await open();
    expect(s.snapshot().workspace.fleetCatalog).toBeNull();
    await run(s, { op: 'get' });
    const first = s.snapshot();
    expect(first.revision).toBe(1);
    expect(first.workspace.fleetCatalog?.hardware.find((h) => h.id === 'dual-4090')?.priceMinor).toBe(650_000);
    await run(s, { op: 'get' });
    expect(s.snapshot().revision).toBe(1);
  });
  it('upsertFleetCatalog saves, refuses duplicate ids, and refuses removing an id a node uses', async () => {
    const s = await open();
    await run(s, { op: 'get' });
    const cat = s.snapshot().workspace.fleetCatalog!;
    const custom = { id: 'x-1', label: 'Custom', priceMinor: 100, watts: 10, builtIn: false, hidden: false };
    expect((await run(s, { op: 'upsertFleetCatalog', catalog: { ...cat, hardware: [...cat.hardware, custom] } })).ok).toBe(true);
    expect(s.snapshot().workspace.fleetCatalog?.hardware.some((h) => h.id === 'x-1')).toBe(true);
    expect(await run(s, { op: 'upsertFleetCatalog', catalog: { ...cat, hardware: [...cat.hardware, custom, custom] } })).toMatchObject({ ok: false, kind: 'invalid' });
    const p = buildFleetStarter('gpu-cluster', { projectionId: u(1), nodeId: () => u(9000) }, '2020-01-01T00:00:00.000Z', 'P');
    await run(s, { op: 'upsertFleetProjection', projection: p });
    const used = p.nodes[0]!.hardwareId;
    const without = { ...cat, hardware: cat.hardware.filter((h) => h.id !== used) };
    expect(await run(s, { op: 'upsertFleetCatalog', catalog: without })).toMatchObject({ ok: false, kind: 'in-use' });
    const hidden = { ...cat, hardware: cat.hardware.map((h) => (h.id === used ? { ...h, hidden: true } : h)) };
    expect((await run(s, { op: 'upsertFleetCatalog', catalog: hidden })).ok).toBe(true);
  });
});

describe('exports', () => {
  const clock = () => new Date('2026-11-12T10:00:00Z');
  const seed = async () => {
    const s = await open();
    await run(s, { op: 'updateCompany', company: company('USD') });
    await run(s, { op: 'get' });
    const p = buildFleetStarter('gpu-cluster', { projectionId: u(1), nodeId: () => u(9000) }, '2020-01-01T00:00:00.000Z', 'My: plan?');
    await run(s, { op: 'upsertFleetProjection', projection: p });
    return s;
  };
  const withOut = async () => ({ out: await mkdtemp(join(tmpdir(), 'startup-exp-')) });
  it('an unknown projection is not-found for the CSV and the PDF', async () => {
    const s = await open();
    const deps = { csv: { saveCsv: async () => null }, pdf: { printToPdf: async () => Buffer.from(''), savePdf: async () => null } };
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionCsv', projectionId: u(1) }, deps)).toMatchObject({ ok: false, kind: 'not-found' });
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionPdf', projectionId: u(1) }, deps)).toMatchObject({ ok: false, kind: 'not-found' });
  });
  it('writes the projection CSV with a sanitised default name, and a cancel is not saved', async () => {
    const s = await seed();
    const { out } = await withOut();
    let name = '';
    const target = join(out, 'p.csv');
    const csv = { saveCsv: async (n: string) => ((name = n), target) };
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionCsv', projectionId: u(1) }, { csv })).toEqual({ ok: true, value: { saved: true } });
    expect(name).toBe('My plan.csv');
    expect((await readFile(target, 'utf8')).startsWith('\uFEFFmonth,energy')).toBe(true);
    const cancelled = { saveCsv: async () => null };
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionCsv', projectionId: u(1) }, { csv: cancelled })).toEqual({ ok: true, value: { saved: false } });
    await rm(out, { recursive: true, force: true });
  });
  it('writes the runway CSV named by its first month', async () => {
    const s = await seed();
    const { out } = await withOut();
    let name = '';
    const target = join(out, 'r.csv');
    const csv = { saveCsv: async (n: string) => ((name = n), target) };
    const r = await handleStartupRequest(s, { op: 'exportRunwayCsv', scenarioId: BASE_SCENARIO_ID, months: 12 }, { csv, now: clock });
    expect(r).toEqual({ ok: true, value: { saved: true } });
    expect(name).toBe('runway-2026-11.csv');
    expect((await readFile(target, 'utf8')).split('\r\n')).toHaveLength(14); // header + 12 rows + trailing empty
    await rm(out, { recursive: true, force: true });
  });
  it('the PDF removes its temp dir on success and on failure', async () => {
    const s = await seed();
    const { out } = await withOut();
    const tmp = await mkdtemp(join(tmpdir(), 'startup-exp-tmp-'));
    const target = join(out, 'p.pdf');
    let seen = '';
    const ok = { savePdf: async () => target, printToPdf: async (f: string) => ((seen = f), Buffer.from('%PDF')) };
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionPdf', projectionId: u(1) }, { pdf: ok, tmpDir: tmp, now: clock })).toEqual({ ok: true, value: { saved: true } });
    expect(seen.endsWith('projection.html')).toBe(true);
    expect(await readdir(tmp)).toEqual([]);
    const boom = { savePdf: async () => target, printToPdf: async () => { throw new Error('no printer'); } };
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionPdf', projectionId: u(1) }, { pdf: boom, tmpDir: tmp, now: clock })).toMatchObject({ ok: false, kind: 'io' });
    expect(await readdir(tmp)).toEqual([]);
    const cancelled = { savePdf: async () => null, printToPdf: async () => Buffer.from('') };
    expect(await handleStartupRequest(s, { op: 'exportFleetProjectionPdf', projectionId: u(1) }, { pdf: cancelled, tmpDir: tmp })).toEqual({ ok: true, value: { saved: false } });
    await rm(out, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('company', () => {
  it('starts null and is set by updateCompany', async () => {
    const s = await open();
    expect((await run(s, { op: 'get' })).ok).toBe(true);
    expect(s.snapshot().workspace.company).toBeNull();
    await run(s, { op: 'updateCompany', company: company() });
    expect(s.snapshot().workspace.company?.name).toBe('Acme');
  });
  it('fixes the currency once an invoice is issued', async () => {
    const s = await open();
    await run(s, { op: 'updateCompany', company: company() });
    await s.mutate((ws) => ({ ok: true, workspace: { ...ws, invoices: [invoice('issued')] } }));
    expect(await run(s, { op: 'updateCompany', company: company('USD') })).toMatchObject({ ok: false, kind: 'locked' });
    expect((await run(s, { op: 'updateCompany', company: { ...company(), name: 'Renamed' } })).ok).toBe(true);
  });
});

describe('referential integrity', () => {
  it('refuses to remove a milestone others depend on, naming the count', async () => {
    const s = await open();
    await run(s, { op: 'upsertMilestone', milestone: milestone(1) });
    await run(s, { op: 'upsertMilestone', milestone: milestone(2, [1]) });
    await run(s, { op: 'upsertMilestone', milestone: milestone(3, [1]) });
    expect(await run(s, { op: 'removeMilestone', id: u(1) })).toEqual({ ok: false, kind: 'in-use', message: '2 milestones depend on it.' });
    expect((await run(s, { op: 'removeMilestone', id: u(3) })).ok).toBe(true);
  });
  it('refuses to remove a vendor with contracts and a customer with invoices', async () => {
    const s = await open();
    await run(s, { op: 'upsertVendor', vendor });
    await run(s, { op: 'upsertCustomer', customer });
    await run(s, { op: 'upsertContract', contract: { id: u(50), title: 'Hosting', counterparty: { kind: 'vendor', id: u(20) }, start: '2026-01-01', autoRenews: false, noticeDays: 0 } });
    await run(s, { op: 'upsertInvoice', invoice: invoice() });
    expect(await run(s, { op: 'removeVendor', id: u(20) })).toMatchObject({ ok: false, kind: 'in-use', message: '1 contract uses this vendor.' });
    expect(await run(s, { op: 'removeCustomer', id: u(30) })).toMatchObject({ ok: false, kind: 'in-use', message: '1 invoice uses this customer.' });
  });
  it('refuses a contract whose counterparty does not exist', async () => {
    const s = await open();
    expect(await run(s, { op: 'upsertContract', contract: { id: u(50), title: 'x', counterparty: { kind: 'vendor', id: u(99) }, start: '2026-01-01', autoRenews: false, noticeDays: 0 } })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});

describe('roadmap', () => {
  it('rejects a dependency loop with the loop in the message', async () => {
    const s = await open();
    await run(s, { op: 'upsertMilestone', milestone: milestone(1) });
    await run(s, { op: 'upsertMilestone', milestone: milestone(2, [1]) });
    const result = await run(s, { op: 'upsertMilestone', milestone: milestone(1, [2]) });
    expect(result).toMatchObject({ ok: false, kind: 'cycle' });
    expect(result.ok === false && result.message).toContain('M1 → M2 → M1');
  });
  it('rejects a dependency that does not exist', async () => {
    const s = await open();
    expect(await run(s, { op: 'upsertMilestone', milestone: milestone(1, [9]) })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});

describe('scenarios', () => {
  it('keeps Base, caps the count at three', async () => {
    const s = await open();
    expect(await run(s, { op: 'removeScenario', id: BASE_SCENARIO_ID })).toMatchObject({ ok: false, kind: 'invalid' });
    for (const n of [61, 62]) expect((await run(s, { op: 'upsertScenario', scenario: { id: u(n), name: `S${n}`, costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] } })).ok).toBe(true);
    expect(await run(s, { op: 'upsertScenario', scenario: { id: u(63), name: 'S63', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] } })).toMatchObject({ ok: false, kind: 'invalid' });
  });
});

describe('fleet projections', () => {
  const T0 = new Date('2026-11-17T10:00:00.000Z');
  const T1 = new Date('2026-11-18T10:00:00.000Z');
  const proj = (n: number, starter: 'blank' | 'gpu-cluster' = 'gpu-cluster') => {
    let k = n * 100;
    return buildFleetStarter(starter, { projectionId: u(n), nodeId: () => u(5000 + k++) }, '2020-01-01T00:00:00.000Z', `P${n}`);
  };
  const withClock = (store: WorkspaceStore, at: Date) => (request: StartupRequest) => handleStartupRequest(store, request, { now: () => at });
  const list = (store: WorkspaceStore) => store.snapshot().workspace.fleetProjections;

  it('inserts with updatedAt from the injected clock, and keeps createdAt on update', async () => {
    const s = await open();
    expect((await withClock(s, T0)({ op: 'upsertFleetProjection', projection: proj(1) })).ok).toBe(true);
    expect(list(s)[0]).toMatchObject({ updatedAt: T0.toISOString(), createdAt: '2020-01-01T00:00:00.000Z' });
    await withClock(s, T1)({ op: 'upsertFleetProjection', projection: { ...proj(1), name: 'Renamed', createdAt: '2030-01-01T00:00:00.000Z' } });
    expect(list(s)).toHaveLength(1);
    expect(list(s)[0]).toMatchObject({ name: 'Renamed', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: T1.toISOString() });
  });

  it('refuses the 51st projection on insert and on duplicate, but still updates an existing one', async () => {
    const s = await open();
    for (let n = 1; n <= MAX_FLEET_PROJECTIONS; n++) expect((await run(s, { op: 'upsertFleetProjection', projection: proj(n, 'blank') })).ok).toBe(true);
    expect(await run(s, { op: 'upsertFleetProjection', projection: proj(MAX_FLEET_PROJECTIONS + 1, 'blank') })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await run(s, { op: 'duplicateFleetProjection', id: u(1), name: 'Copy' })).toMatchObject({ ok: false, kind: 'invalid' });
    expect((await run(s, { op: 'upsertFleetProjection', projection: proj(1, 'blank') })).ok).toBe(true);
  });

  it('answers not-found for an unknown id on remove and duplicate', async () => {
    const s = await open();
    expect(await run(s, { op: 'removeFleetProjection', id: u(999) })).toMatchObject({ ok: false, kind: 'not-found' });
    expect(await run(s, { op: 'duplicateFleetProjection', id: u(999), name: 'Copy' })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('removes a projection', async () => {
    const s = await open();
    await run(s, { op: 'upsertFleetProjection', projection: proj(1) });
    expect((await run(s, { op: 'removeFleetProjection', id: u(1) })).ok).toBe(true);
    expect(list(s)).toEqual([]);
  });

  it('duplicates with new ids, directly after the source, leaving the source unchanged', async () => {
    const s = await open();
    for (const n of [1, 2]) await withClock(s, T0)({ op: 'upsertFleetProjection', projection: proj(n) });
    const source = structuredClone(list(s)[0]!);
    await withClock(s, T1)({ op: 'duplicateFleetProjection', id: u(1), name: 'Copy of P1' });
    const after = list(s);
    expect(after.map((p) => p.name)).toEqual(['P1', 'Copy of P1', 'P2']);
    expect(after[0]).toEqual(source);
    const copy = after[1]!;
    expect(copy.id).not.toBe(source.id);
    expect(copy).toMatchObject({ createdAt: T1.toISOString(), updatedAt: T1.toISOString() });
    expect(copy.nodes).toHaveLength(source.nodes.length);
    const sourceIds = new Set(source.nodes.map((n) => n.id));
    expect(copy.nodes.every((n) => !sourceIds.has(n.id))).toBe(true);
    expect(copy.nodes.map(({ id: _id, ...rest }) => rest)).toEqual(source.nodes.map(({ id: _id, ...rest }) => rest));
  });
});

describe('invoices (drafts only until Theme F)', () => {
  it('saves a draft, refuses an issued one, and answers no-book for ledger ops', async () => {
    const s = await open();
    await run(s, { op: 'upsertCustomer', customer });
    expect((await run(s, { op: 'upsertInvoice', invoice: invoice() })).ok).toBe(true);
    expect(await run(s, { op: 'upsertInvoice', invoice: invoice('issued') })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await run(s, { op: 'issueInvoice', id: u(40), issueDate: '2026-11-11' })).toMatchObject({ ok: false, kind: 'no-book' });
  });
});

describe('projection', () => {
  it('refuses before the company exists, and for an unknown scenario', async () => {
    const s = await open();
    expect(await run(s, { op: 'projection', scenarioId: BASE_SCENARIO_ID, months: 12 })).toMatchObject({ ok: false, kind: 'invalid' });
    await run(s, { op: 'updateCompany', company: company() });
    expect(await run(s, { op: 'projection', scenarioId: u(99), months: 12 })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('projects the stored lines from the company opening cash, for Base without a stored scenario', async () => {
    const s = await open();
    await run(s, { op: 'updateCompany', company: company() });
    const line = { id: u(50), kind: 'cost' as const, name: 'Rent', category: 'premises' as const, minor: 10000, cadence: 'monthly' as const, start: '2000-01', growthBpPerMonth: 0 };
    await run(s, { op: 'upsertLine', line });
    const result = await run(s, { op: 'projection', scenarioId: BASE_SCENARIO_ID, months: 12 });
    expect(result).toMatchObject({ ok: true, value: { burnMinor: -10000 } });
  });
});

describe('contracts', () => {
  const contract = (over: object = {}) => ({
    id: u(70), title: 'Hosting', counterparty: { kind: 'vendor' as const, id: u(20) }, start: '2026-01-15', end: '2026-12-31',
    autoRenews: false, noticeDays: 0, value: { minor: 5000, cadence: 'monthly' as const }, ...over,
  });
  const withVendor = async () => {
    const s = await open();
    await run(s, { op: 'updateCompany', company: company() });
    await run(s, { op: 'upsertVendor', vendor });
    return s;
  };

  it('keeps one linked cost line for a priced contract, and updates it in place', async () => {
    const s = await withVendor();
    await run(s, { op: 'upsertContract', contract: contract() });
    const first = s.snapshot().workspace.lines;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ contractId: u(70), kind: 'cost', category: 'software', minor: 5000, start: '2026-01', end: '2026-12' });
    await run(s, { op: 'upsertContract', contract: contract({ value: { minor: 9000, cadence: 'monthly' } }) });
    const second = s.snapshot().workspace.lines;
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: first[0]!.id, minor: 9000 });
  });

  it('drops the line when the price is removed or the contract is deleted', async () => {
    const s = await withVendor();
    await run(s, { op: 'upsertContract', contract: contract() });
    await run(s, { op: 'upsertContract', contract: contract({ value: undefined }) });
    expect(s.snapshot().workspace.lines).toHaveLength(0);
    await run(s, { op: 'upsertContract', contract: contract() });
    await run(s, { op: 'removeContract', id: u(70) });
    expect(s.snapshot().workspace.lines).toHaveLength(0);
  });

  it('refuses to attach to a missing contract, and opens nothing without a file', async () => {
    const s = await withVendor();
    expect(await run(s, { op: 'attachContractFile', contractId: u(71) })).toMatchObject({ ok: false, kind: 'not-found' });
    await run(s, { op: 'upsertContract', contract: contract() });
    expect(await run(s, { op: 'openContractFile', contractId: u(70) })).toMatchObject({ ok: false, kind: 'not-found' });
  });
});

describe('investor updates', () => {
  const upd = (n: number, period: string) => ({
    id: u(n), period, title: `Update ${period}`, markdown: '## Highlights\nHi', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', drafts: [],
  });
  const withCompany = async () => {
    const s = await open();
    await run(s, { op: 'updateCompany', company: company('ZAR') });
    return s;
  };
  type Req = { prompt: string; agentId?: string | undefined; ollamaModel?: string | undefined };
  const runner = (text: string) => {
    const calls: Req[] = [];
    const investor = {
      run: async (r: Req) => {
        calls.push(r);
        return { ok: true as const, text, model: r.ollamaModel ? `ollama:${r.ollamaModel}` : (r.agentId ?? 'claude') };
      },
      agents: async () => [{ id: 'claude', label: 'Claude' }],
    };
    return { calls, investor };
  };

  it('keeps one update per period, and removes by id', async () => {
    const s = await open();
    expect((await run(s, { op: 'upsertInvestorUpdate', update: upd(1, '2026-10') })).ok).toBe(true);
    expect(await run(s, { op: 'upsertInvestorUpdate', update: upd(2, '2026-10') })).toMatchObject({ ok: false, kind: 'invalid' });
    expect((await run(s, { op: 'upsertInvestorUpdate', update: { ...upd(1, '2026-10'), markdown: 'edited' } })).ok).toBe(true);
    expect(s.snapshot().workspace.investorUpdates).toHaveLength(1);
    expect(s.snapshot().workspace.investorUpdates[0]!.markdown).toBe('edited');
    expect(await run(s, { op: 'removeInvestorUpdate', id: u(9) })).toMatchObject({ ok: false, kind: 'not-found' });
    await run(s, { op: 'removeInvestorUpdate', id: u(1) });
    expect(s.snapshot().workspace.investorUpdates).toEqual([]);
  });

  it('drafts through the runner, returns cleaned markdown, and saves nothing', async () => {
    const s = await withCompany();
    const before = s.snapshot().revision;
    const { calls, investor } = runner('```markdown\n## Highlights\nWe shipped.\n```');
    const result = await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: 'Hiring' }, { investor, now: () => new Date('2026-11-18T10:00:00Z') });
    expect(result).toEqual({ ok: true, value: { markdown: '## Highlights\nWe shipped.', model: 'claude' } });
    expect(calls[0]!.prompt).toContain('Hiring');
    expect(s.snapshot().revision).toBe(before);
    expect(s.snapshot().workspace.investorUpdates).toEqual([]);
  });

  it('uses the stored model unless the request names one, and an Ollama setting wins over an agent', async () => {
    const s = await withCompany();
    const { calls, investor } = runner('x');
    const aiSettings = { get: () => ({ agentId: 'codex', ollamaModel: '' }), set: async (v: never) => v };
    await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' }, { investor, aiSettings });
    await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '', agentId: 'claude' }, { investor, aiSettings });
    await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' }, { investor, aiSettings: { ...aiSettings, get: () => ({ agentId: 'codex', ollamaModel: 'llama3' }) } });
    expect(calls.map((c) => [c.agentId, c.ollamaModel])).toEqual([['codex', undefined], ['claude', undefined], [undefined, 'llama3']]);
  });

  it("feeds last month's update to the prompt for tone", async () => {
    const s = await withCompany();
    await run(s, { op: 'upsertInvestorUpdate', update: { ...upd(1, '2026-10'), markdown: 'LAST-MONTH-TEXT' } });
    const { calls, investor } = runner('x');
    await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' }, { investor });
    expect(calls[0]!.prompt).toContain('LAST-MONTH-TEXT');
  });

  it('refuses to draft without a company, a runner, or an answer', async () => {
    const bare = await open();
    const { investor } = runner('x');
    expect(await handleStartupRequest(bare, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' }, { investor })).toMatchObject({ ok: false, kind: 'invalid' });
    const s = await withCompany();
    expect(await run(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' })).toMatchObject({ ok: false, kind: 'invalid' });
    const failing = { ...investor, run: async () => ({ ok: false as const, message: 'No agent CLI' }) };
    expect(await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' }, { investor: failing })).toEqual({ ok: false, kind: 'io', message: 'No agent CLI' });
    const blank = runner('  ');
    expect(await handleStartupRequest(s, { op: 'draftInvestorUpdate', period: '2026-11', notes: '' }, { investor: blank.investor })).toMatchObject({ ok: false, kind: 'io' });
  });

  it('answers the AI settings ops: defaults without a store, the agent list, and a test prompt', async () => {
    const s = await open();
    expect(await run(s, { op: 'getAiSettings' })).toEqual({ ok: true, value: { agentId: 'claude', ollamaModel: '' } });
    expect(await run(s, { op: 'setAiSettings', settings: { agentId: 'codex', ollamaModel: '' } })).toMatchObject({ ok: false });
    expect(await run(s, { op: 'listAiAgents' })).toEqual({ ok: true, value: [] });
    const { investor } = runner('ready');
    expect(await handleStartupRequest(s, { op: 'listAiAgents' }, { investor })).toEqual({ ok: true, value: [{ id: 'claude', label: 'Claude' }] });
    expect(await handleStartupRequest(s, { op: 'testAiModel' }, { investor })).toEqual({ ok: true, value: { model: 'claude', reply: 'ready' } });
  });
});
