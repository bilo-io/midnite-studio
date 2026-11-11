import { useState, type FormEvent } from 'react';

import { PLAN_CADENCES, type Contract, type Vendor } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { fromMinor, toMinor } from '../money-input';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

/** Add or edit one vendor contract; a price keeps a linked cost line in the plan (main owns that). */
export function ContractSheet({ contract, vendors, currency, onClose }: { contract: Contract | null; vendors: readonly Vendor[]; currency: string; onClose: () => void }) {
  const save = useStartupWrite((bridge, next: Contract) => bridge.upsertContract({ contract: next }));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeContract({ id }));
  const attach = useStartupWrite((bridge, contractId: string) => bridge.attachContractFile({ contractId }));
  const open = useStartupWrite((bridge, contractId: string) => bridge.openContractFile({ contractId }));
  const [id] = useState(() => contract?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(contract?.title ?? '');
  const [vendorId, setVendorId] = useState(contract?.counterparty.id ?? vendors[0]?.id ?? '');
  const [start, setStart] = useState(contract?.start ?? '');
  const [end, setEnd] = useState(contract?.end ?? '');
  const [autoRenews, setAutoRenews] = useState(contract?.autoRenews ?? false);
  const [term, setTerm] = useState(String(contract?.renewalTermMonths ?? 12));
  const [notice, setNotice] = useState(String(contract?.noticeDays ?? 0));
  const [price, setPrice] = useState(contract?.value === undefined ? '' : fromMinor(contract.value.minor, currency));
  const [cadence, setCadence] = useState<NonNullable<Contract['value']>['cadence']>(contract?.value?.cadence ?? 'monthly');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (title.trim() === '') return setProblem('Give the contract a title.');
    if (vendorId === '') return setProblem('Add a vendor first.');
    if (start === '') return setProblem('Pick a start date.');
    if (end !== '' && end < start) return setProblem('The end cannot be before the start.');
    if (autoRenews && end === '') return setProblem('An auto-renewing contract needs an end date for its first term.');
    const minor = price.trim() === '' ? null : toMinor(price, currency);
    if (price.trim() !== '' && (minor === null || minor < 0)) return setProblem('Enter the price as a number.');
    const noticeDays = Math.round(Number(notice));
    const termMonths = Math.round(Number(term));
    if (!Number.isFinite(noticeDays) || noticeDays < 0 || noticeDays > 365) return setProblem('Notice is between 0 and 365 days.');
    if (autoRenews && (!Number.isFinite(termMonths) || termMonths < 1 || termMonths > 60)) return setProblem('A renewal term is between 1 and 60 months.');
    setProblem(null);
    save.mutate(
      {
        id,
        title: title.trim(),
        counterparty: { kind: 'vendor', id: vendorId },
        start,
        ...(end !== '' ? { end } : {}),
        autoRenews,
        ...(autoRenews ? { renewalTermMonths: termMonths } : {}),
        noticeDays,
        ...(minor !== null ? { value: { minor, cadence } } : {}),
        ...(contract?.file !== undefined ? { file: contract.file } : {}),
      },
      { onSuccess: onClose, onError: (e) => setProblem(e.message) },
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4" aria-label={contract === null ? 'Add contract' : 'Edit contract'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{contract === null ? 'Add contract' : 'Edit contract'}</h2>
        <label className={LABEL}>
          Title
          <input className={FIELD} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={LABEL}>
          Vendor
          <select className={FIELD} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={LABEL}>
            Start
            <input className={FIELD} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={LABEL}>
            End
            <input className={FIELD} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={autoRenews} onChange={(e) => setAutoRenews(e.target.checked)} />
          Renews automatically
        </label>
        {autoRenews ? (
          <label className={LABEL}>
            Renewal term (months)
            <input className={FIELD} inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />
          </label>
        ) : null}
        <label className={LABEL}>
          Notice (days)
          <input className={FIELD} inputMode="numeric" value={notice} onChange={(e) => setNotice(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={LABEL}>
            Price ({currency})
            <input className={FIELD} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className={LABEL}>
            Cadence
            <select className={FIELD} value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
              {PLAN_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {contract !== null ? (
          <div className="flex items-center gap-2 text-xs">
            {contract.file !== undefined ? (
              <button type="button" onClick={() => open.mutate(contract.id, { onError: (e) => setProblem(e.message) })} className="truncate underline">
                Open {contract.file.name}
              </button>
            ) : (
              <span className="text-muted-foreground">No file attached</span>
            )}
            <button type="button" onClick={() => attach.mutate(contract.id, { onError: (e) => setProblem(e.message) })} className="ml-auto rounded-md border border-border px-2 py-1">
              {contract.file !== undefined ? 'Replace file' : 'Attach file'}
            </button>
          </div>
        ) : null}
        {problem !== null ? (
          <p role="alert" className="text-xs text-red-500">
            {problem}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" disabled={save.isPending} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Save
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-sm">
            Cancel
          </button>
          {contract !== null ? (
            <button type="button" onClick={() => remove.mutate(contract.id, { onSuccess: onClose, onError: (e) => setProblem(e.message) })} className="ml-auto h-8 rounded-md px-3 text-sm text-red-500">
              Remove
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
