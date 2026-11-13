import { describe, expect, it } from 'vitest';
import { CHANNELS, EVENT_CHANNELS } from './ipc/channels';
import {
  JournalEntrySchema,
  LedgerAccountSchema,
  LedgerBookSchema,
  LedgerPostInputSchema,
  LedgerRequestSchema,
  normalSide,
} from './ledger';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-11-12T10:00:00.000Z';
const account = { id: id(1), code: '1000', name: 'Bank', type: 'asset', subtype: 'bank' } as const;
const entry = {
  id: id(10),
  date: '2026-11-12',
  description: 'Sale',
  lines: [
    { accountId: id(1), side: 'debit', minor: 5000 },
    { accountId: id(2), side: 'credit', minor: 5000 },
  ],
  source: { app: 'money', kind: 'manual' },
  postedAt: now,
} as const;

describe('ledger schemas', () => {
  it('round-trips an account, a book and an entry', () => {
    expect(LedgerAccountSchema.parse(account)).toMatchObject({ archived: false, taxTreatment: 'none' });
    const book = LedgerBookSchema.parse({
      version: 1,
      id: id(5),
      name: 'Acme',
      entity: 'company',
      currency: 'GBP',
      fiscalYearStart: { month: 4, day: 1 },
      accounts: [account],
      createdAt: now,
    });
    expect(book.lockedThrough).toBeNull();
    expect(book.rules).toEqual([]);
    expect(JournalEntrySchema.parse(entry).lines).toHaveLength(2);
  });

  it('fails an unbalanced entry on the lines path', () => {
    const bad = { ...entry, lines: [entry.lines[0], { ...entry.lines[1], minor: 4999 }] };
    const r = JournalEntrySchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['lines']);
  });

  it('rejects a zero or negative line amount (no sign errors)', () => {
    expect(JournalEntrySchema.safeParse({ ...entry, lines: [{ ...entry.lines[0], minor: -5000 }, entry.lines[1]] }).success).toBe(false);
  });

  it('rejects a subtype that does not belong to the type', () => {
    expect(LedgerAccountSchema.safeParse({ ...account, type: 'income', subtype: 'bank' }).success).toBe(false);
  });

  it('strips an unknown field on a book instead of failing', () => {
    const r = LedgerBookSchema.parse({
      version: 1, id: id(5), name: 'A', entity: 'personal', currency: 'USD', fiscalYearStart: { month: 1, day: 1 },
      accounts: [], createdAt: now, futureField: 1,
    });
    expect('futureField' in r).toBe(false);
  });

  it('maps normal sides', () => {
    expect(normalSide('asset')).toBe('debit');
    expect(normalSide('expense')).toBe('debit');
    expect(normalSide('income')).toBe('credit');
  });

  it('post input drops id and postedAt', () => {
    const { id: _i, postedAt: _p, ...input } = entry;
    expect(LedgerPostInputSchema.safeParse(input).success).toBe(true);
  });
});

describe('ledger channel', () => {
  const { id: _i, postedAt: _p, ...input } = entry;
  it('names its channels', () => {
    expect(CHANNELS.ledger).toBe('mstudio:ledger:op');
    expect(EVENT_CHANNELS.ledgerChanged).toBe('mstudio:ledger:changed');
  });
  it('accepts a manual post and rejects any other kind from the renderer', () => {
    expect(LedgerRequestSchema.safeParse({ op: 'post', bookId: id(5), entry: input }).success).toBe(true);
    const invoice = { ...input, source: { app: 'money', kind: 'invoice', ref: 'INV-1' } };
    expect(LedgerRequestSchema.safeParse({ op: 'post', bookId: id(5), entry: invoice }).success).toBe(false);
  });
  it('caps journal limit and applies a default', () => {
    expect(LedgerRequestSchema.safeParse({ op: 'journal', bookId: id(5), limit: 501 }).success).toBe(false);
    const r = LedgerRequestSchema.parse({ op: 'journal', bookId: id(5) });
    expect(r.op === 'journal' && r.limit).toBe(100);
  });
  it('rejects an unknown op', () => {
    expect(LedgerRequestSchema.safeParse({ op: 'drop', bookId: id(5) }).success).toBe(false);
  });
});
