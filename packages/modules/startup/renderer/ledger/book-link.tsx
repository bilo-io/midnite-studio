import { useState } from 'react';

import type { StartupWorkspace } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { useBooks } from './use-books';

/**
 * Settings ▸ Company ▸ Books: which book invoices post into. Books come from the ledger bridge (the same folder
 * Money opens); one in another currency is listed but disabled, and one open for writing in another app is
 * disabled too, because a post would be refused. Main re-checks everything and resolves the four accounts, so a
 * book with no receivable account is refused with its own message, shown here as it arrives.
 */
export function BookLink({ currency, ledger }: { currency: string; ledger: StartupWorkspace['ledger'] }) {
  const books = useBooks();
  const link = useStartupWrite((bridge, bookId: string | null) => bridge.linkBook({ bookId }));
  const [choice, setChoice] = useState(ledger?.bookId ?? '');
  const linked = books.data?.find((b) => b.id === ledger?.bookId);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-2 px-6 pb-6" aria-label="Books">
      <h3 className="text-sm font-semibold">Books</h3>
      <p className="text-xs text-muted-foreground">Invoices post their journal entries into this book. Create one in the Books group if you have none.</p>
      {books.isError ? (
        <p role="alert" className="text-xs text-red-500">
          {books.error.message}
        </p>
      ) : null}
      {books.data !== undefined && books.data.length === 0 ? <p className="text-xs text-muted-foreground">No books yet.</p> : null}
      <div className="flex items-center gap-2">
        <select aria-label="Book" className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">No book linked</option>
          {(books.data ?? []).map((b) => {
            const reason = b.currency !== currency ? 'Different currency' : b.readOnly && b.id !== ledger?.bookId ? 'Open for writing in another app' : null;
            return (
              <option key={b.id} value={b.id} disabled={reason !== null}>
                {b.name} · {b.currency}
                {reason !== null ? ` (${reason})` : ''}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          disabled={link.isPending || choice === (ledger?.bookId ?? '')}
          onClick={() => link.mutate(choice === '' ? null : choice)}
          className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {choice === '' ? 'Unlink' : 'Link'}
        </button>
      </div>
      {ledger !== null ? <p className="text-xs text-muted-foreground">Linked to {linked?.name ?? 'a book'}.</p> : null}
      {link.error !== null ? (
        <p role="alert" className="text-xs text-red-500">
          {link.error.message}
        </p>
      ) : null}
    </section>
  );
}
