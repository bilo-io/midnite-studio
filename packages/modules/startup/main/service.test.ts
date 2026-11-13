// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASE_SCENARIO_ID, type StartupRequest } from '@midnite/studio-shared';

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
