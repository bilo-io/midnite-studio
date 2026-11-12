import { useMemo, useState } from 'react';

import { formatAmount, type ImportCommitResult, type ImportMapping, type ImportPick, type ImportPreviewRow, type LedgerAccount, type LedgerBook } from '@midnite/studio-shared';

import { useImportPreview, useLedgerCall } from './ledger-data';
import { BUTTON, Banner, ErrorLine, Field, INPUT, PRIMARY } from './ledger-ui';
import { useActiveBook } from './overview';

const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] as const;
const PAGE = 200;

type AmountKind = 'single' | 'split';
type Choice = { accountId: string; remember: boolean };

/** Picks the column a header probably is, falling back to a position. */
const guess = (header: readonly string[], pattern: RegExp, fallback: number): number => {
  const at = header.findIndex((h) => pattern.test(h));
  return at >= 0 ? at : Math.min(fallback, Math.max(0, header.length - 1));
};

type MappingForm = {
  bankAccountId: string;
  dateColumn: number;
  dateFormat: ImportMapping['date']['format'];
  description: number;
  kind: AmountKind;
  amountColumn: number;
  negativeIsOutflow: boolean;
  inColumn: number;
  outColumn: number;
};

function initialForm(header: readonly string[], accounts: readonly LedgerAccount[]): MappingForm {
  const bank = accounts.find((a) => !a.archived && a.subtype === 'bank') ?? accounts.find((a) => !a.archived && a.type === 'asset');
  const inColumn = guess(header, /^(credit|in|paid in|money in|deposit)/i, 2);
  const outColumn = guess(header, /^(debit|out|paid out|money out|withdraw)/i, 3);
  const hasSplit = header.some((h) => /^(credit|paid in|money in|deposit)/i.test(h)) && header.some((h) => /^(debit|paid out|money out|withdraw)/i.test(h));
  return {
    bankAccountId: bank?.id ?? '',
    dateColumn: guess(header, /date/i, 0),
    dateFormat: 'YYYY-MM-DD',
    description: guess(header, /desc|detail|narrat|payee|reference|memo/i, 1),
    kind: hasSplit ? 'split' : 'single',
    amountColumn: guess(header, /amount|value/i, 2),
    negativeIsOutflow: true,
    inColumn,
    outColumn,
  };
}

function toMapping(token: string, f: MappingForm): ImportMapping | null {
  if (f.bankAccountId === '') return null;
  return {
    token,
    bankAccountId: f.bankAccountId,
    date: { column: f.dateColumn, format: f.dateFormat },
    description: f.description,
    amount: f.kind === 'single' ? { kind: 'single', column: f.amountColumn, negativeIsOutflow: f.negativeIsOutflow } : { kind: 'split', inColumn: f.inColumn, outColumn: f.outColumn },
  };
}

function ColumnSelect({ label, header, value, onChange }: { label: string; header: readonly string[]; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <select className={INPUT} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h.trim() === '' ? `Column ${i + 1}` : h}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Mapper({ book, picked, form, setForm }: { book: LedgerBook; picked: ImportPick; form: MappingForm; setForm: (f: MappingForm) => void }) {
  const set = (patch: Partial<MappingForm>): void => setForm({ ...form, ...patch });
  const banks = book.accounts.filter((a) => !a.archived && a.type === 'asset');
  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">Map the columns</legend>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Bank account">
          <select className={INPUT} value={form.bankAccountId} onChange={(e) => set({ bankAccountId: e.target.value })}>
            {banks.length === 0 ? <option value="">No asset account</option> : null}
            {banks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </Field>
        <ColumnSelect label="Date column" header={picked.header} value={form.dateColumn} onChange={(dateColumn) => set({ dateColumn })} />
        <Field label="Date format">
          <select className={INPUT} value={form.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as MappingForm['dateFormat'] })}>
            {DATE_FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
        <ColumnSelect label="Description column" header={picked.header} value={form.description} onChange={(description) => set({ description })} />
      </div>
      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
        <Field label="Amounts">
          <select className={INPUT} value={form.kind} onChange={(e) => set({ kind: e.target.value as AmountKind })}>
            <option value="single">One signed column</option>
            <option value="split">Separate in and out columns</option>
          </select>
        </Field>
        {form.kind === 'single' ? (
          <>
            <ColumnSelect label="Amount column" header={picked.header} value={form.amountColumn} onChange={(amountColumn) => set({ amountColumn })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.negativeIsOutflow} onChange={(e) => set({ negativeIsOutflow: e.target.checked })} />A negative amount is money out
            </label>
          </>
        ) : (
          <>
            <ColumnSelect label="Money in column" header={picked.header} value={form.inColumn} onChange={(inColumn) => set({ inColumn })} />
            <ColumnSelect label="Money out column" header={picked.header} value={form.outColumn} onChange={(outColumn) => set({ outColumn })} />
          </>
        )}
      </div>
    </fieldset>
  );
}

function Summary({ result, onDone }: { result: ImportCommitResult; onDone: () => void }) {
  return (
    <section role="status" aria-label="Import summary" className="grid max-w-xl gap-2 rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-medium">
        Posted {result.posted} {result.posted === 1 ? 'entry' : 'entries'}
        {result.duplicates > 0 ? `, skipped ${result.duplicates} already imported` : ''}
        {result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}.
      </h2>
      {result.failed.length > 0 ? (
        <ul className="text-sm text-red-600 dark:text-red-400">
          {result.failed.slice(0, 20).map((f) => (
            <li key={f.index}>
              Row {f.index + 1}: {f.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={`${BUTTON} justify-self-start`} onClick={onDone}>
        Import another statement
      </button>
    </section>
  );
}

export function ImportView() {
  const { bookId, detail } = useActiveBook();
  const call = useLedgerCall();
  const [picked, setPicked] = useState<ImportPick | null>(null);
  const [form, setForm] = useState<MappingForm | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const mapping = picked && form ? toMapping(picked.token, form) : null;
  const preview = useImportPreview(bookId, mapping);

  const book = detail.data?.book;
  const accountName = useMemo(() => new Map((book?.accounts ?? []).map((a) => [a.id, `${a.code} ${a.name}`])), [book]);

  if (bookId === null) return <p role="status" className="text-sm text-muted-foreground">Create a book on the Overview tab first.</p>;
  if (detail.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading…</p>;
  if (detail.isError) return <ErrorLine error={{ kind: detail.error.kind, message: detail.error.message }} />;
  const { readOnly, lockedBy } = detail.data;
  const fmt = (minor: number): string => formatAmount({ minor, currency: detail.data.book.currency });

  const reset = (): void => {
    setPicked(null);
    setForm(null);
    setChoices({});
    setResult(null);
    setError(null);
    setOnlyNeeds(false);
    setShown(PAGE);
  };

  const pick = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    const r = await call((api) => api.importPick({ bookId }));
    setBusy(false);
    if (!r.ok) return setError(r);
    if (r.value === null) return;
    setPicked(r.value);
    setForm(initialForm(r.value.header, detail.data.book.accounts));
    setChoices({});
    setResult(null);
  };

  if (result) return <Summary result={result} onDone={reset} />;

  if (!picked || !form) {
    return (
      <section className="mx-auto grid max-w-md gap-3 text-center">
        <h2 className="text-base font-medium">Import a bank statement</h2>
        <p className="text-sm text-muted-foreground">Choose a CSV from your bank. Nothing leaves this computer, and a file you import twice posts nothing twice.</p>
        {readOnly ? <Banner tone="amber">Read-only{lockedBy ? ` — this book is open for writing in ${lockedBy}.` : ' — this book cannot be written.'}</Banner> : null}
        <button type="button" className={`${PRIMARY} justify-self-center`} disabled={readOnly || busy} onClick={() => void pick()}>
          Choose a statement…
        </button>
        <ErrorLine error={error} />
      </section>
    );
  }

  const rows = preview.data?.rows ?? [];
  const accountFor = (r: ImportPreviewRow): string => choices[r.index]?.accountId ?? r.suggestedAccountId ?? '';
  const postable = rows.filter((r) => !r.error && !r.duplicate);
  const needing = postable.filter((r) => accountFor(r) === '');
  const errors = rows.filter((r) => r.error);
  const duplicates = rows.filter((r) => r.duplicate && !r.error);
  const visible = (onlyNeeds ? rows.filter((r) => !r.error && !r.duplicate && accountFor(r) === '') : rows).slice(0, shown);
  const ready = postable.length - needing.length;
  const open = detail.data.book.accounts.filter((a) => !a.archived && a.id !== form.bankAccountId);

  const commit = async (): Promise<void> => {
    if (!mapping) return;
    setError(null);
    setBusy(true);
    const r = await call((api) =>
      api.importCommit({
        bookId,
        mapping,
        rows: postable.map((row) => ({ index: row.index, accountId: accountFor(row), ...(choices[row.index]?.remember ? { remember: true } : {}) })),
      }),
    );
    setBusy(false);
    if (r.ok) setResult(r.value);
    else setError(r);
  };

  return (
    <div className="grid gap-4">
      <Mapper book={detail.data.book} picked={picked} form={form} setForm={setForm} />
      {preview.isError ? <ErrorLine error={{ kind: preview.error.kind, message: preview.error.message }} /> : null}
      {preview.isPending && mapping ? <p role="status" className="text-sm text-muted-foreground">Reading the statement…</p> : null}
      {preview.data ? (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {rows.length} rows · {ready} ready · {needing.length} need an account
            {duplicates.length > 0 ? ` · ${duplicates.length} already imported` : ''}
            {errors.length > 0 ? ` · ${errors.length} unreadable` : ''}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyNeeds} onChange={(e) => setOnlyNeeds(e.target.checked)} />
            Needs an account ({needing.length})
          </label>
          <table className="w-full text-sm" aria-label="Statement rows">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="w-28">Date</th>
                <th>Description</th>
                <th className="w-32 text-right">Amount</th>
                <th className="w-72 pl-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const chosen = choices[r.index];
                return (
                  <tr key={r.index} className={r.duplicate || r.error ? 'text-muted-foreground' : ''}>
                    <td className="tabular-nums">{r.date}</td>
                    <td>{r.description}</td>
                    <td className="text-right tabular-nums">{r.error ? '' : fmt(r.minor)}</td>
                    <td className="py-0.5 pl-3">
                      {r.error ? (
                        <span className="text-red-600 dark:text-red-400">{r.error}</span>
                      ) : r.duplicate ? (
                        'Already imported'
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Account for row ${r.index + 1}`}
                            className={INPUT}
                            aria-invalid={accountFor(r) === ''}
                            value={accountFor(r)}
                            onChange={(e) => setChoices((c) => ({ ...c, [r.index]: { accountId: e.target.value, remember: c[r.index]?.remember ?? false } }))}
                          >
                            <option value="">Needs an account</option>
                            {open.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} {a.name}
                              </option>
                            ))}
                          </select>
                          {chosen && chosen.accountId !== '' ? (
                            <label className="flex items-center gap-1 whitespace-nowrap text-xs" title={`Always file "${r.description}" under ${accountName.get(chosen.accountId) ?? 'this account'}`}>
                              <input
                                type="checkbox"
                                aria-label={`Remember for next time, row ${r.index + 1}`}
                                checked={chosen.remember}
                                onChange={(e) => setChoices((c) => ({ ...c, [r.index]: { accountId: chosen.accountId, remember: e.target.checked } }))}
                              />
                              Remember
                            </label>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > shown && !onlyNeeds ? (
            <button type="button" className={`${BUTTON} justify-self-start`} onClick={() => setShown((n) => n + PAGE)}>
              Show more
            </button>
          ) : null}
          {postable.length === 0 ? <p role="status" className="text-sm text-muted-foreground">Nothing to post: every readable row is already in the books.</p> : null}
        </>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="button" className={PRIMARY} disabled={busy || readOnly || postable.length === 0 || needing.length > 0} onClick={() => void commit()}>
          Post {postable.length} {postable.length === 1 ? 'entry' : 'entries'}
        </button>
        <button type="button" className={BUTTON} onClick={reset}>
          Choose another file
        </button>
        {needing.length > 0 ? <span className="text-sm text-muted-foreground">Choose an account for {needing.length} {needing.length === 1 ? 'row' : 'rows'} first.</span> : null}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}
