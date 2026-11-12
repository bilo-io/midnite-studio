import { useState, type FormEvent } from 'react';

import type { Customer } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

/** Add or edit one customer. Removing one with invoices or contracts is refused by main, and its message shows here. */
export function CustomerSheet({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const save = useStartupWrite((bridge, next: Customer) => bridge.upsertCustomer({ customer: next }));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeCustomer({ id }));
  const [id] = useState(() => customer?.id ?? crypto.randomUUID());
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [taxId, setTaxId] = useState(customer?.taxId ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (name.trim() === '') return setProblem('Give the customer a name.');
    if (email.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setProblem('That email address does not look right.');
    setProblem(null);
    save.mutate(
      { id, name: name.trim(), ...(email.trim() !== '' ? { email: email.trim() } : {}), address, ...(taxId.trim() !== '' ? { taxId: taxId.trim() } : {}) },
      { onSuccess: onClose, onError: (e) => setProblem(e.message) },
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4" aria-label={customer === null ? 'Add customer' : 'Edit customer'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{customer === null ? 'Add customer' : 'Edit customer'}</h2>
        <label className={LABEL}>
          Name
          <input className={FIELD} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={LABEL}>
          Email
          <input className={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={LABEL}>
          Address (printed on invoices)
          <textarea className={`${FIELD} h-16 py-1`} value={address} maxLength={400} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className={LABEL}>
          Tax id
          <input className={FIELD} value={taxId} maxLength={40} onChange={(e) => setTaxId(e.target.value)} />
        </label>
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
          {customer !== null ? (
            <button type="button" onClick={() => remove.mutate(customer.id, { onSuccess: onClose, onError: (e) => setProblem(e.message) })} className="ml-auto h-8 rounded-md px-3 text-sm text-red-500">
              Remove
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
