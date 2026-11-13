import type { LedgerService } from '@midnite/studio-feature-ledger/main';
import type { StartupLedgerPort } from '@midnite/studio-module-startup/main';

/**
 * Startup's `StartupLedgerPort` over the books service this host built for the Accountant module — the same
 * books Money opens. `source.app` is stamped here, never by the module or the renderer, so an invoice entry's
 * provenance cannot be claimed by anything but this host.
 */
export function createStartupLedgerPort(service: LedgerService): StartupLedgerPort {
  return {
    async listBooks() {
      const r = await service.listBooks();
      if (!r.ok) return r;
      return {
        ok: true,
        value: r.value.books.filter((b) => b.corrupt === undefined).map((b) => ({ id: b.id, name: b.name, entity: b.entity, currency: b.currency, readOnly: b.readOnly })),
      };
    },

    async accounts(bookId) {
      const r = await service.getBook(bookId);
      if (!r.ok) return r;
      return { ok: true, value: { name: r.value.book.name, accounts: r.value.book.accounts.map(({ id, code, type, subtype, archived }) => ({ id, code, type, subtype, archived })) } };
    },

    async post(req, source) {
      const r = await service.post(req, { app: 'startup', ...source });
      return r.ok ? { ok: true, value: { entryId: r.value.entry.id, duplicate: r.value.duplicate } } : r;
    },

    async reverse(bookId, entryId, date, reason) {
      const r = await service.reverse(bookId, entryId, date, reason);
      return r.ok ? { ok: true, value: { entryId: r.value.entry.id } } : r;
    },

    async cashBalance(bookId, asOf) {
      const [book, balances] = await Promise.all([service.getBook(bookId), service.balances(bookId, asOf)]);
      if (!book.ok) return book;
      if (!balances.ok) return balances;
      const cash = new Set(book.value.book.accounts.filter((a) => a.subtype === 'cash' || a.subtype === 'bank').map((a) => a.id));
      const minor = balances.value.balances.filter((b) => cash.has(b.accountId)).reduce((total, b) => total + b.debit - b.credit, 0);
      return { ok: true, value: { minor } };
    },

    async monthlyNet(bookId, from, to) {
      const book = await service.getBook(bookId);
      if (!book.ok) return book;
      const types = new Map(book.value.book.accounts.map((a) => [a.id, a.type]));
      const months = new Map<string, { incomeMinor: number; expenseMinor: number }>();
      // Every month in range appears, even one with no entries: a quiet month is a month of zero burn.
      for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) months.set(m, { incomeMinor: 0, expenseMinor: 0 });
      let cursor: string | undefined;
      do {
        const page = await service.journal({ bookId, from, to, limit: 500, ...(cursor !== undefined ? { cursor } : {}) });
        if (!page.ok) return page;
        for (const entry of page.value.entries) {
          const bucket = months.get(entry.date.slice(0, 7));
          if (bucket === undefined) continue;
          for (const line of entry.lines) {
            const type = types.get(line.accountId);
            const signed = line.side === 'debit' ? line.minor : -line.minor;
            if (type === 'income') bucket.incomeMinor -= signed;
            else if (type === 'expense') bucket.expenseMinor += signed;
          }
        }
        cursor = page.value.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return { ok: true, value: [...months].map(([month, v]) => ({ month, ...v })) };
    },
  };
}

function nextMonth(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}
