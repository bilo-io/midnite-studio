import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from './ipc/channels';
import {
  CompanyProfileSchema,
  ContractSchema,
  CustomerSchema,
  InvoiceSchema,
  MilestoneSchema,
  PlanLineSchema,
  RunwayScenarioSchema,
  StartupRequestSchema,
  StartupWorkspaceSchema,
  VendorSchema,
  milestoneCycle,
  type Milestone,
} from './startup';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('StartupWorkspaceSchema', () => {
  it('parses an empty { version: 1 } into a full workspace', () => {
    const ws = StartupWorkspaceSchema.parse({ version: 1 });
    expect(ws).toEqual({
      version: 1,
      company: null,
      milestones: [],
      lines: [],
      scenarios: [],
      customers: [],
      invoices: [],
      vendors: [],
      contracts: [],
      invoiceCounter: 0,
      ledger: null,
    });
  });

  it('refuses a version it does not know', () => {
    expect(StartupWorkspaceSchema.safeParse({ version: 2 }).success).toBe(false);
  });
});

describe('record schemas round-trip', () => {
  const cases: [string, { parse: (v: unknown) => unknown }, unknown][] = [
    ['company', CompanyProfileSchema, { name: 'Acme', currency: 'GBP', openingCash: { minor: 100_000_00, asOf: '2026-11-01' } }],
    ['milestone', MilestoneSchema, { id: u(1), title: 'Beta', status: 'planned', due: '2027-01-31', dependsOn: [] }],
    ['line', PlanLineSchema, { id: u(2), kind: 'cost', name: 'Rent', category: 'premises', minor: 120000, cadence: 'monthly', start: '2026-12' }],
    ['scenario', RunwayScenarioSchema, { id: u(3), name: 'Base' }],
    ['vendor', VendorSchema, { id: u(4), name: 'Cloud Co', category: 'software' }],
    ['contract', ContractSchema, { id: u(5), title: 'Hosting', counterparty: { kind: 'vendor', id: u(4) }, start: '2026-01-01' }],
    ['customer', CustomerSchema, { id: u(6), name: 'Big Client', email: 'ap@client.example' }],
    ['invoice', InvoiceSchema, { id: u(7), customerId: u(6), lines: [{ description: 'Work', quantityMilli: 1500, unitMinor: 8000, taxRateBp: 2000 }], status: 'draft' }],
  ];
  it.each(cases)('%s', (_name, schema, value) => {
    const once = schema.parse(value);
    expect(schema.parse(once)).toEqual(once);
  });

  it('applies the documented defaults', () => {
    const company = CompanyProfileSchema.parse({ name: 'A', currency: 'GBP', openingCash: { minor: 0, asOf: '2026-11-01' } });
    expect(company).toMatchObject({ invoicePrefix: 'INV-', paymentTermsDays: 30, address: '' });
    expect(InvoiceSchema.parse({ id: u(7), customerId: u(6), lines: [{ description: 'x', quantityMilli: 1000, unitMinor: 1, taxRateBp: 0 }], status: 'draft' })).toMatchObject({ number: null, issueDate: null });
  });

  it('rejects bad currencies, dates and prefixes', () => {
    expect(CompanyProfileSchema.safeParse({ name: 'A', currency: 'gbp', openingCash: { minor: 0, asOf: '2026-11-01' } }).success).toBe(false);
    expect(MilestoneSchema.safeParse({ id: u(1), title: 'x', status: 'planned', due: '11/12/2026', dependsOn: [] }).success).toBe(false);
    expect(CompanyProfileSchema.safeParse({ name: 'A', currency: 'GBP', invoicePrefix: 'lower', openingCash: { minor: 0, asOf: '2026-11-01' } }).success).toBe(false);
  });
});

describe('StartupRequestSchema', () => {
  it('parses every op by its discriminator', () => {
    expect(StartupRequestSchema.parse({ op: 'get' })).toEqual({ op: 'get' });
    expect(StartupRequestSchema.parse({ op: 'projection', scenarioId: u(3), months: 24 })).toMatchObject({ months: 24 });
    expect(StartupRequestSchema.parse({ op: 'linkBook', bookId: null })).toEqual({ op: 'linkBook', bookId: null });
  });
  it('rejects an unknown op and a bad horizon', () => {
    expect(StartupRequestSchema.safeParse({ op: 'nope' }).success).toBe(false);
    expect(StartupRequestSchema.safeParse({ op: 'projection', scenarioId: u(3), months: 18 }).success).toBe(false);
  });
});

describe('startup channels', () => {
  it('names one invoke channel and one event', () => {
    expect(CHANNELS.startup).toBe('mstudio:startup:op');
    expect(EVENT_CHANNELS.startupChanged).toBe('mstudio:startup:changed');
  });
});

describe('milestoneCycle', () => {
  const m = (n: number, dependsOn: number[]): Milestone => ({
    id: u(n), title: `M${n}`, description: '', status: 'planned', due: '2027-01-01', dependsOn: dependsOn.map(u), tags: [],
  });
  it('finds A to B to A', () => {
    expect(milestoneCycle([m(1, [2]), m(2, [])], u(2), [u(1)])).toEqual(['M2', 'M1', 'M2']);
  });
  it('treats a self-dependency as a cycle', () => {
    expect(milestoneCycle([m(1, [])], u(1), [u(1)])).toEqual(['M1', 'M1']);
  });
  it('accepts a diamond and a plain chain', () => {
    const all = [m(1, [2, 3]), m(2, [4]), m(3, [4]), m(4, [])];
    expect(milestoneCycle(all, u(1), [u(2), u(3)])).toBeNull();
    expect(milestoneCycle(all, u(5), [u(1)])).toBeNull();
  });
});
