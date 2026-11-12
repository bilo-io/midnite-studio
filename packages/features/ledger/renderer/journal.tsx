import { useRef, useState, type KeyboardEvent } from 'react';

import { formatAmount, parseAmount, type JournalEntry, type LedgerAccount, type LedgerBook } from '@midnite/studio-shared';

import { useJournal, useLedgerCall } from './ledger-data';
import { todayIso } from './ledger-math';
import { useLedgerUiStore } from './ledger-ui-store';
import { BUTTON, ErrorLine, Field, INPUT, PRIMARY, Sheet } from './ledger-ui';
import { useActiveBook } from './overview';

const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', import: 'Import', invoice: 'Invoice', payment: 'Payment', bill: 'Bill', reversal: 'Reversal' };

type Row = { accountId: string; debit: string; credit: string; memo: string };
const blankRow = (): Row => ({ accountId: '', debit: '', credit: '', memo: '' });

type Parsed = { minor: number; side: 'debit' | 'credit' } | { error: string } | null;

/** One row's amount cells: exactly one side, a positive amount; an empty row is `null`. */
function parseRow(row: Row, currency: string): Parsed {
  const d = row.debit.trim();
  const c = row.credit.trim();
  if (d === '' && c === '') return null;
  if (d !== '' && c !== '') return { error: 'Use debit or credit, not both.' };
  const text = d !== '' ? d : c;
  const r = parseAmount(text, currency);
  if (!r.ok) return { error: r.reason.replaceAll('-', ' ') };
  if (r.minor <= 0) return { error: 'Must be more than zero.' };
  return { minor: r.minor, side: d !== '' ? 'debit' : 'credit' };
}

function NewEntrySheet({ book, accounts, onClose, onOpenSettings }: { book: LedgerBook; accounts: LedgerAccount[]; onClose: () => void; onOpenSettings: () => void }) {
  const call = useLedgerCall();
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow()]);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);

  const parsed = rows.map((r) => parseRow(r, book.currency));
  const sum = (side: 'debit' | 'credit'): number => parsed.reduce((t, p) => (p && 'minor' in p && p.side === side ? t + p.minor : t), 0);
  const difference = sum('debit') - sum('credit');
  const usable = rows.map((r, i) => ({ row: r, parsed: parsed[i] })).filter((x) => x.parsed !== null);
  const everyRowOk = usable.length >= 2 && usable.every((x) => x.row.accountId !== '' && x.parsed && 'minor' in x.parsed);
  const canPost = everyRowOk && difference === 0 && description.trim() !== '' && date !== '' && sum('debit') > 0;

  const setRow = (i: number, patch: Partial<Row>): void => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const post = async (): Promise<void> => {
    setError(null);
    const lines = usable.map(({ row, parsed: p }) => {
      const ok = p as { minor: number; side: 'debit' | 'credit' };
      return { accountId: row.accountId, side: ok.side, minor: ok.minor, ...(row.memo.trim() ? { memo: row.memo.trim() } : {}) };
    });
    const r = await call((api) => api.post({ bookId: book.id, entry: { date, description: description.trim(), lines, source: { app: 'money', kind: 'manual' } } }));
    if (r.ok) onClose();
    else setError(r);
  };

  return (
    <Sheet title="New entry" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input className={INPUT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Description">
          <input className={INPUT} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-2">
        {rows.map((row, i) => {
          const p = parsed[i];
          const bad = p !== null && p !== undefined && 'error' in p ? p.error : null;
          return (
            <div key={i} className="grid grid-cols-[1fr_6rem_6rem] gap-2" role="group" aria-label={`Line ${i + 1}`}>
              <select aria-label={`Account ${i + 1}`} className={INPUT} value={row.accountId} onChange={(e) => setRow(i, { accountId: e.target.value })}>
                <option value="">Account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
              <input aria-label={`Debit ${i + 1}`} aria-invalid={bad !== null} title={bad ?? undefined} className={`${INPUT} text-right`} inputMode="decimal" placeholder="Debit" value={row.debit} onChange={(e) => setRow(i, { debit: e.target.value })} />
              <input aria-label={`Credit ${i + 1}`} aria-invalid={bad !== null} title={bad ?? undefined} className={`${INPUT} text-right`} inputMode="decimal" placeholder="Credit" value={row.credit} onChange={(e) => setRow(i, { credit: e.target.value })} />
              <input aria-label={`Memo ${i + 1}`} className={`${INPUT} col-span-3`} placeholder="Memo (optional)" value={row.memo} maxLength={200} onChange={(e) => setRow(i, { memo: e.target.value })} />
              {bad ? (
                <p role="alert" className="col-span-3 -mt-1 text-xs text-red-600">
                  {bad}
                </p>
              ) : null}
            </div>
          );
        })}
        <button type="button" className={`${BUTTON} justify-self-start`} disabled={rows.length >= 200} onClick={() => setRows((rs) => [...rs, blankRow()])}>
          Add line
        </button>
      </div>
      <p className="text-sm" aria-live="polite">
        Difference: <span className="tabular-nums">{formatAmount({ minor: difference, currency: book.currency })}</span>
      </p>
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} disabled={!canPost} onClick={() => void post()}>
          Post
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
      </div>
      <ErrorLine error={error} lockedThrough={book.lockedThrough} onOpenSettings={onOpenSettings} />
    </Sheet>
  );
}

function ReverseSheet({ book, entry, onClose, onOpenSettings }: { book: LedgerBook; entry: JournalEntry; onClose: () => void; onOpenSettings: () => void }) {
  const call = useLedgerCall();
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const submit = async (): Promise<void> => {
    setError(null);
    const r = await call((api) => api.reverse({ bookId: book.id, entryId: entry.id, date, reason: reason.trim() }));
    if (r.ok) onClose();
    else setError(r);
  };
  return (
    <Sheet title={`Reverse "${entry.description}"`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Posts a mirror entry on the date below. The original stays in the journal.</p>
      <Field label="Reversal date">
        <input className={INPUT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Reason">
        <input className={INPUT} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} disabled={reason.trim() === '' || date === ''} onClick={() => void submit()}>
          Reverse entry
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
      </div>
      <ErrorLine error={error} lockedThrough={book.lockedThrough} onOpenSettings={onOpenSettings} />
    </Sheet>
  );
}

export function Journal({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { bookId, detail } = useActiveBook();
  const filter = useLedgerUiStore((s) => s.journalFilter);
  const setFilter = useLedgerUiStore((s) => s.setJournalFilter);
  const journal = useJournal(bookId, filter);
  const [sheet, setSheet] = useState<'new' | JournalEntry | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  if (bookId === null) return <p role="status" className="text-sm text-muted-foreground">Create a book on the Overview tab first.</p>;
  if (detail.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading journal…</p>;
  if (detail.isError) return <ErrorLine error={{ kind: detail.error.kind, message: detail.error.message }} />;

  const { book, readOnly } = detail.data;
  const names = new Map(book.accounts.map((a) => [a.id, `${a.code} ${a.name}`]));
  const entries = journal.data?.pages.flatMap((p) => p.entries) ?? [];
  const reversalOf = new Map(entries.filter((e) => e.reverses).map((e) => [e.reverses as string, e]));
  const total = (e: JournalEntry): number => e.lines.reduce((t, l) => (l.side === 'debit' ? t + l.minor : t), 0);
  const fmt = (minor: number): string => formatAmount({ minor, currency: book.currency });

  const onKey = (e: KeyboardEvent<HTMLUListElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(entries.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      const at = entries[cursor];
      if (at) setExpanded((x) => (x === at.id ? null : at.id));
    } else if ((e.key === 'n' || e.key === 'N') && !readOnly && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setSheet('new');
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Account">
          <select className={INPUT} value={filter.accountId ?? ''} onChange={(e) => setFilter({ accountId: e.target.value === '' ? null : e.target.value })}>
            <option value="">All accounts</option>
            {book.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search">
          <input className={INPUT} value={filter.query} onChange={(e) => setFilter({ query: e.target.value })} placeholder="Description" />
        </Field>
        <button type="button" className={PRIMARY} disabled={readOnly} onClick={() => setSheet('new')}>
          New entry
        </button>
      </div>
      {journal.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading journal…</p> : null}
      {journal.isError ? <ErrorLine error={{ kind: journal.error.kind, message: journal.error.message }} /> : null}
      {journal.isSuccess && entries.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">{filter.accountId || filter.query ? 'No entries match.' : 'No entries yet. Post the first one.'}</p>
      ) : null}
      <ul ref={listRef} tabIndex={0} aria-label="Journal entries" onKeyDown={onKey} className="grid gap-1 outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {entries.map((e, i) => {
          const reversal = reversalOf.get(e.id);
          const open = expanded === e.id;
          return (
            <li key={e.id} aria-current={i === cursor} className={`rounded-md border border-border p-2 text-sm ${i === cursor ? 'bg-muted' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{e.date}</span>
                <button type="button" className="flex-1 text-left hover:underline" aria-expanded={open} onClick={() => setExpanded(open ? null : e.id)}>
                  {e.description}
                </button>
                <span className="rounded-full bg-muted px-2 text-xs">{SOURCE_LABEL[e.source.kind] ?? e.source.kind}</span>
                <span className="tabular-nums">{fmt(total(e))}</span>
                {reversal ? (
                  <span className="text-xs text-muted-foreground">Reversed on {reversal.date}</span>
                ) : e.reverses ? null : (
                  <button type="button" className={BUTTON} disabled={readOnly} onClick={() => setSheet(e)}>
                    Reverse
                  </button>
                )}
              </div>
              {open ? (
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {e.lines.map((l, j) => (
                      <tr key={j}>
                        <td>{names.get(l.accountId) ?? l.accountId}</td>
                        <td className="text-right tabular-nums">{l.side === 'debit' ? fmt(l.minor) : ''}</td>
                        <td className="text-right tabular-nums">{l.side === 'credit' ? fmt(l.minor) : ''}</td>
                        <td className="pl-3 text-muted-foreground">{l.memo ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </li>
          );
        })}
      </ul>
      {journal.hasNextPage ? (
        <button type="button" className={`${BUTTON} justify-self-start`} disabled={journal.isFetchingNextPage} onClick={() => void journal.fetchNextPage()}>
          Load more
        </button>
      ) : null}
      {sheet === 'new' ? <NewEntrySheet book={book} accounts={book.accounts.filter((a) => !a.archived)} onClose={() => setSheet(null)} onOpenSettings={onOpenSettings} /> : null}
      {sheet && sheet !== 'new' ? <ReverseSheet book={book} entry={sheet} onClose={() => setSheet(null)} onOpenSettings={onOpenSettings} /> : null}
    </div>
  );
}
