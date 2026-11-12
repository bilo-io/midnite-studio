import { useState } from 'react';

import { MARKET_CURRENCIES, formatAmount, LEDGER_ENTITIES, type LedgerBook, type LedgerEntity } from '@midnite/studio-shared';
import { useFrameChrome } from '@midnite/studio-frame';

import { useBalances, useBookDetail, useBooks, useLedgerCall } from './ledger-data';
import { balanceMap, dayAfter, dayBefore, fiscalYearStart, profitOf, sumBySubtype, todayIso } from './ledger-math';
import { useLedgerUiStore, resolveBookId } from './ledger-ui-store';
import { BUTTON, Banner, ErrorLine, Field, INPUT, PRIMARY, Sheet } from './ledger-ui';
import { ledgerApi } from './ledger-data';
import type { LedgerTab } from './ledger-workspace';

const ENTITY_LABEL: Record<LedgerEntity, string> = { personal: 'Personal', 'sole-trader': 'Sole trader', company: 'Company' };

/** The active book (the persisted choice, falling back to the first) with its summary and detail queries. */
export function useActiveBook() {
  const books = useBooks();
  const stored = useLedgerUiStore((s) => s.bookId);
  const bookId = resolveBookId(stored, books.data?.books ?? []);
  const detail = useBookDetail(bookId);
  return { books, bookId, detail };
}

function CreateBookForm({ onCreated }: { onCreated: (id: string) => void }) {
  const call = useLedgerCall();
  const [name, setName] = useState('');
  const [entity, setEntity] = useState<LedgerEntity>('sole-trader');
  const [template, setTemplate] = useState<LedgerEntity>('sole-trader');
  const [currency, setCurrency] = useState('GBP');
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await call((api) => api.createBook({ name: name.trim(), entity, currency, fiscalYearStart: { month, day }, template }));
    setBusy(false);
    if (r.ok) onCreated(r.value.book.id);
    else setError(r);
  };

  return (
    <form
      aria-label="Create a book"
      className="mx-auto grid max-w-md gap-3 rounded-xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Name">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Entity">
        <select
          className={INPUT}
          value={entity}
          onChange={(e) => {
            const next = e.target.value as LedgerEntity;
            setEntity(next);
            setTemplate(next);
          }}
        >
          {LEDGER_ENTITIES.map((v) => (
            <option key={v} value={v}>
              {ENTITY_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Currency">
        <select className={INPUT} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {MARKET_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fiscal year starts (month)">
          <input className={INPUT} type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
        </Field>
        <Field label="Day">
          <input className={INPUT} type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Chart of accounts">
        <select className={INPUT} value={template} onChange={(e) => setTemplate(e.target.value as LedgerEntity)}>
          {LEDGER_ENTITIES.map((v) => (
            <option key={v} value={v}>
              {ENTITY_LABEL[v]} template
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className={PRIMARY} disabled={busy || name.trim() === ''}>
        Create a book
      </button>
      <ErrorLine error={error} />
    </form>
  );
}

function BookSettings({ book, onClose }: { book: LedgerBook; onClose: () => void }) {
  const call = useLedgerCall();
  const dialogs = useFrameChrome().useDialogs();
  const [name, setName] = useState(book.name);
  const [locked, setLocked] = useState(book.lockedThrough ?? '');
  const [jurisdiction, setJurisdiction] = useState(book.jurisdiction ?? '');
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);

  const apply = async (): Promise<void> => {
    setError(null);
    const r = await call((api) =>
      api.updateBook({ bookId: book.id, patch: { name: name.trim(), lockedThrough: locked === '' ? null : locked, jurisdiction: jurisdiction === '' ? null : (jurisdiction as 'uk-ew-ni') } }),
    );
    if (r.ok) onClose();
    else setError(r);
  };

  const save = async (): Promise<void> => {
    const movingLater = locked !== '' && (book.lockedThrough === null || locked > book.lockedThrough);
    if (!movingLater) return apply();
    // How many entries fall in the newly locked range (a page of 500 is counted, then "500+").
    const after = book.lockedThrough ?? '';
    const r = await ledgerApi()?.journal({ bookId: book.id, from: after === '' ? undefined : dayAfter(after), to: locked, limit: 500 });
    const n = r?.ok ? r.value.entries.length : 0;
    dialogs.confirm({
      title: `Lock books through ${locked}?`,
      body: `${n}${r?.ok && r.value.nextCursor ? '+' : ''} entries fall in the newly locked range and can no longer be reversed into it.`,
      confirmLabel: 'Lock',
      onConfirm: () => void apply(),
    });
  };

  return (
    <Sheet title="Book settings" onClose={onClose}>
      <Field label="Name">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Lock books through">
        <input className={INPUT} type="date" value={locked} onChange={(e) => setLocked(e.target.value)} />
      </Field>
      <Field label="Tax jurisdiction">
        <select className={INPUT} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
          <option value="">None</option>
          <option value="uk-ew-ni">United Kingdom (England, Wales, Northern Ireland)</option>
        </select>
      </Field>
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} disabled={name.trim() === ''} onClick={() => void save()}>
          Save
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
      </div>
      <ErrorLine error={error} />
    </Sheet>
  );
}

function Headline({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="rounded-xl border border-border bg-card p-4 text-left hover:bg-muted" aria-label={`${label}: ${value}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
    </button>
  );
}

function Headlines({ book, onOpenTab }: { book: LedgerBook; onOpenTab: (tab: LedgerTab) => void }) {
  const setFilter = useLedgerUiStore((s) => s.setJournalFilter);
  const today = todayIso();
  const start = fiscalYearStart(book.fiscalYearStart, today);
  const now = useBalances(book.id, today);
  const before = useBalances(book.id, dayBefore(start));
  if (now.isPending || before.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading balances…</p>;
  if (now.isError || before.isError) return <ErrorLine error={{ kind: 'io', message: (now.error ?? before.error)?.message ?? 'Could not load balances.' }} />;
  const rows = balanceMap(now.data.balances);
  const prior = balanceMap(before.data.balances);
  const fmt = (minor: number): string => formatAmount({ minor, currency: book.currency });
  const profit = profitOf(book.accounts, rows) - profitOf(book.accounts, prior);
  const open = (subtypes: readonly string[]) => (): void => {
    const matches = book.accounts.filter((a) => subtypes.includes(a.subtype));
    setFilter({ accountId: matches.length === 1 ? (matches[0]?.id ?? null) : null, query: '' });
    onOpenTab('journal');
  };
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Headline label="Cash" value={fmt(sumBySubtype(book.accounts, rows, ['cash', 'bank']))} onOpen={open(['cash', 'bank'])} />
      <Headline label="Owed to you" value={fmt(sumBySubtype(book.accounts, rows, ['receivable']))} onOpen={open(['receivable'])} />
      <Headline label="You owe" value={fmt(sumBySubtype(book.accounts, rows, ['payable', 'tax-payable']))} onOpen={open(['payable', 'tax-payable'])} />
      <Headline label="Profit this fiscal year" value={fmt(profit)} onOpen={open(['sales', 'other-income'])} />
    </div>
  );
}

export function Overview({ onOpenTab }: { onOpenTab: (tab: LedgerTab) => void }) {
  const { books, bookId, detail } = useActiveBook();
  const setBookId = useLedgerUiStore((s) => s.setBookId);
  const settingsOpen = useLedgerUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useLedgerUiStore((s) => s.setSettingsOpen);
  const [creating, setCreating] = useState(false);

  if (books.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading books…</p>;
  if (books.isError) return <ErrorLine error={{ kind: books.error.kind, message: books.error.message }} />;

  if (books.data.books.length === 0 || creating) {
    return (
      <div className="grid gap-4">
        {books.data.books.length === 0 ? (
          <section role="status" className="mx-auto max-w-md text-center">
            <h2 className="text-base font-medium">No books yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Books you keep here stay on this computer.</p>
          </section>
        ) : null}
        <CreateBookForm
          onCreated={(id) => {
            setBookId(id);
            setCreating(false);
          }}
        />
        {creating ? (
          <button type="button" className={`${BUTTON} mx-auto`} onClick={() => setCreating(false)}>
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  const book = detail.data?.book;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Book</span>
          <select aria-label="Book" className={`${INPUT} w-auto`} value={bookId ?? ''} onChange={(e) => setBookId(e.target.value)}>
            {books.data.books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={BUTTON} onClick={() => setCreating(true)}>
          New book
        </button>
        {book ? (
          <button type="button" className={BUTTON} onClick={() => setSettingsOpen(true)}>
            Book settings
          </button>
        ) : null}
      </div>
      {detail.isError ? <ErrorLine error={{ kind: detail.error.kind, message: detail.error.message }} /> : null}
      {detail.data?.corrupt ? (
        <Banner tone="red">
          <span>
            Journal line{detail.data.corrupt.lines.length === 1 ? '' : 's'} {detail.data.corrupt.lines.join(', ')} could not be read, so this book is read-only. Folder: {detail.data.corrupt.path}
          </span>
          <button type="button" className={BUTTON} onClick={() => void navigator.clipboard?.writeText(detail.data?.corrupt?.path ?? '')}>
            Copy path
          </button>
        </Banner>
      ) : detail.data?.readOnly ? (
        <Banner tone="amber">Read-only — this book is open for writing in {detail.data.lockedBy ?? 'another app'}.</Banner>
      ) : null}
      {book ? <Headlines book={book} onOpenTab={onOpenTab} /> : detail.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading book…</p> : null}
      {book && settingsOpen ? <BookSettings book={book} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
