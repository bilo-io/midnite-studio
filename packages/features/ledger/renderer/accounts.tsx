import { useState } from 'react';

import { ACCOUNT_TYPES, SUBTYPES_BY_TYPE, formatAmount, type AccountSubtype, type AccountType, type LedgerAccount, type LedgerBook } from '@midnite/studio-shared';

import { useBalances, useLedgerCall } from './ledger-data';
import { accountBalance, balanceMap, todayIso } from './ledger-math';
import { BUTTON, ErrorLine, Field, INPUT, PRIMARY, Sheet } from './ledger-ui';
import { useActiveBook } from './overview';

const TYPE_LABEL: Record<AccountType, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };

function AccountSheet({ book, account, readOnly, balance, onClose }: { book: LedgerBook; account: LedgerAccount | null; readOnly: boolean; balance: number; onClose: () => void }) {
  const call = useLedgerCall();
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'expense');
  const [subtype, setSubtype] = useState<AccountSubtype>(account?.subtype ?? 'operating-expense');
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);

  const save = async (): Promise<void> => {
    setError(null);
    const r = await call((api) =>
      api.upsertAccount({
        bookId: book.id,
        account: { ...(account ? { id: account.id } : {}), code, name: name.trim(), type, subtype, archived: account?.archived ?? false, taxTreatment: account?.taxTreatment ?? (type === 'expense' ? 'allowable' : 'none') },
      }),
    );
    if (r.ok) onClose();
    else setError(r);
  };

  const archive = async (): Promise<void> => {
    if (!account) return;
    // Refused here with the balance named; main refuses too.
    if (balance !== 0) {
      setError({ kind: 'invalid', message: `${account.name} has a balance of ${formatAmount({ minor: balance, currency: book.currency })} and cannot be archived.` });
      return;
    }
    setError(null);
    const r = await call((api) => api.archiveAccount({ bookId: book.id, accountId: account.id }));
    if (r.ok) onClose();
    else setError(r);
  };

  return (
    <Sheet title={account ? 'Edit account' : 'Add account'} onClose={onClose}>
      <Field label="Code">
        <input className={INPUT} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
      </Field>
      <Field label="Name">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Type">
        <select
          className={INPUT}
          value={type}
          disabled={account !== null}
          onChange={(e) => {
            const next = e.target.value as AccountType;
            setType(next);
            setSubtype(SUBTYPES_BY_TYPE[next][0] as AccountSubtype);
          }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subtype">
        <select className={INPUT} value={subtype} onChange={(e) => setSubtype(e.target.value as AccountSubtype)}>
          {SUBTYPES_BY_TYPE[type].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <button type="button" className={PRIMARY} disabled={readOnly || !/^[0-9]{3,6}$/.test(code) || name.trim() === ''} onClick={() => void save()}>
          Save
        </button>
        {account && !account.archived ? (
          <button type="button" className={BUTTON} disabled={readOnly} onClick={() => void archive()}>
            Archive
          </button>
        ) : null}
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
      </div>
      <ErrorLine error={error} />
    </Sheet>
  );
}

export function Accounts() {
  const { bookId, detail } = useActiveBook();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<LedgerAccount | 'new' | null>(null);
  const balances = useBalances(bookId, todayIso());

  if (bookId === null) return <p role="status" className="text-sm text-muted-foreground">Create a book on the Overview tab first.</p>;
  if (detail.isPending || balances.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading accounts…</p>;
  if (detail.isError) return <ErrorLine error={{ kind: detail.error.kind, message: detail.error.message }} />;
  if (balances.isError) return <ErrorLine error={{ kind: balances.error.kind, message: balances.error.message }} />;

  const { book, readOnly } = detail.data;
  const rows = balanceMap(balances.data.balances);
  const sorted = [...book.accounts].sort((a, b) => a.code.localeCompare(b.code));
  const editingAccount = editing && editing !== 'new' ? editing : null;
  const balanceOf = (a: LedgerAccount): number => accountBalance(a, rows.get(a.id));

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button type="button" className={PRIMARY} disabled={readOnly} onClick={() => setEditing('new')}>
          Add account
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>
      {ACCOUNT_TYPES.map((type) => {
        const group = sorted.filter((a) => a.type === type && (showArchived || !a.archived));
        if (group.length === 0) return null;
        return (
          <section key={type} aria-label={TYPE_LABEL[type]}>
            <h3 className="mb-1 text-sm font-medium">{TYPE_LABEL[type]}</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="w-20 py-1 font-normal">Code</th>
                  <th className="font-normal">Name</th>
                  <th className="font-normal">Subtype</th>
                  <th className="text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {group.map((a) => (
                  <tr key={a.id} className={`border-t border-border ${a.archived ? 'opacity-60' : ''}`}>
                    <td className="py-1 tabular-nums">{a.code}</td>
                    <td>
                      <button type="button" className="hover:underline" onClick={() => setEditing(a)}>
                        {a.name}
                      </button>
                      {a.archived ? <span className="ml-2 text-xs text-muted-foreground">archived</span> : null}
                    </td>
                    <td className="text-muted-foreground">{a.subtype}</td>
                    <td className="text-right tabular-nums">{formatAmount({ minor: balanceOf(a), currency: book.currency })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {editing ? <AccountSheet book={book} account={editingAccount} readOnly={readOnly} balance={editingAccount ? balanceOf(editingAccount) : 0} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
