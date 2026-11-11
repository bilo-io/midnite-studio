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
