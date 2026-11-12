import { describe, expect, it } from 'vitest';

import { LEDGER_UI_DEFAULTS, migrateLedgerUi, resolveBookId } from './ledger-ui-store';

describe('ledger ui store', () => {
  it('migrates a v0 blob to the defaults and keeps a v1 blob', () => {
    expect(migrateLedgerUi({ bookId: 'x' }, 0)).toEqual(LEDGER_UI_DEFAULTS);
    expect(migrateLedgerUi({ bookId: 'x', journalFilter: { accountId: null, query: '' }, reportRange: 'month' }, 1)).toMatchObject({ bookId: 'x', reportRange: 'month' });
  });
  it('resolves an unknown bookId to the first book, and null with none', () => {
    expect(resolveBookId('gone', [{ id: 'a' }, { id: 'b' }])).toBe('a');
    expect(resolveBookId('b', [{ id: 'a' }, { id: 'b' }])).toBe('b');
    expect(resolveBookId('b', [])).toBeNull();
  });
});
